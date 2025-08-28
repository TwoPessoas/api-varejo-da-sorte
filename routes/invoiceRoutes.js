// src/routes/invoiceRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // Seu pool de conexão com o banco de dados
const axios = require("axios"); // Para fazer requisições HTTP para a API externa

// Middlewares e Utils Genéricos
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");
const { logActivity } = require("../utils/logger");
const { createCrudHandlers } = require("../utils/crudHandlers"); // Importa a factory de CRUD
const { createExportHandler } = require("../utils/exportHandlers"); // Importa a factory de Exportação
const { toSnakeCase, convertKeysToCamelCase } = require("../utils/objectUtils"); // Para toSnakeCase
const { buildQuery } = require("../utils/queryBuilder"); // Para reutilizar na custom getAll

// Validações Específicas da Fatura
const {
  invoiceValidationRules,
  invoiceValidationErrors,
  addInvoiceValidationRules,
} = require("../validators/invoiceValidador");
const { formatNumberWithZeros } = require("../utils/numberUtils");

// --- Configurações Específicas da Entidade Fatura ---
const tableName = "invoices";
const idField = "id";

// Configurações de Negócio
const MINIMUM_FISCAL_NOTE_VALUE = 200; // R$ 200,00 - valor mínimo para participar

// Campos que podem ser criados (camelCase)
const creatableFields = [
  "fiscalCode",
  "clientId",
  "invoceValue",
  "hasItem",
  "hasCreditcard",
  "hasPartnerCode",
  "pdv",
  "store",
  "numCoupon",
  "cnpj",
  "creditcard",
];

// Campos que podem ser atualizados (camelCase)
const updatableFields = [
  /*'fiscalCode', 'invoceValue', 'hasItem', 'hasCreditcard', 'hasPartnerCode',
  'pdv', 'store', 'numCoupon', 'cnpj', 'creditcard', 'clientId'*/
];

// Campos que podem ser pesquisados/filtrados na listagem e exportação (camelCase)
const searchableFields = [
  "fiscalCode",
  "cnpj",
  "store",
  "numCoupon",
  "pdv",
  "clientId",
];

// Definição das colunas para exportação
const invoiceExportColumns = [
  { key: "id", header: "ID", width: 10 },
  { key: "fiscal_code", header: "Cód. Fiscal", width: 20 },
  { key: "invoce_value", header: "Valor", width: 15 },
  { key: "has_item", header: "Tem Item", width: 12 },
  { key: "has_creditcard", header: "Tem Cartão", width: 15 },
  { key: "has_partner_code", header: "Tem Cód. Parceiro", width: 20 },
  { key: "pdv", header: "PDV", width: 10 },
  { key: "store", header: "Loja", width: 10 },
  { key: "num_coupon", header: "Num. Cupom", width: 15 },
  { key: "cnpj", header: "CNPJ", width: 20 },
  { key: "creditcard", header: "Cartão Crédito", width: 20 },
  { key: "client_id", header: "ID Cliente", width: 15 },
  { key: "created_at", header: "Criado Em", width: 25 },
  { key: "updated_at", header: "Atualizado Em", width: 25 },
];

// --- Configurações da API Externa ---
const EXTERNAL_API_URL =
  "https://atakarejo.api.integrasky.cloud/DF52GXU1/atakarejo/venda/produtos_participantes";
const EXTERNAL_API_AUTH = Buffer.from(
  "4QvbfSf8_Promocao:<K11(X8Y2eA1Hk1ut3"
).toString("base64"); // Autenticação Base64
//const EXTERNAL_API_AUTH = Buffer.from("4QvbfSf8_Promocao:<K11(X8Y2eA1Hk1ut3", 'base64').toString('utf8');

// --- Funções Auxiliares ---
const hasCreditcardInInvoice = (bandeiras) => {
  if (!Array.isArray(bandeiras)) return false;

  //console.log(`[hasCreditcardInInvoice] bandeiras:`, bandeiras);

  for (const p of bandeiras) {
    if (p === 30 || p === 31 || p === 32) return true;
  }
  return false;
};

const hasPartnerCodeInInvoice = (json) => {
  return false; // Mantendo a lógica original
};

const getProductsInInvoice = async (json) => {
  const products = json.detalhe_produto;

  if (!Array.isArray(products) || products.length === 0) {
    return [];
  }

  const allEans = products.map((product) => product.ean);

  // 2. Cria um Set para remover as duplicatas e depois converte de volta para array
  const uniqueEans = [...new Set(allEans)];
  // 3. Retorna a consulta dinâmica
  return await criarConsultaProdutosPorEan(uniqueEans);
};

// Função para gerar a consulta dinâmica e os valores
const criarConsultaProdutosPorEan = async (eans) => {
  // Caso a lista de EANs esteja vazia, não há o que consultar.
  // Retornar uma consulta que não devolve nada ou um objeto vazio para ser tratado.
  if (!eans || eans.length === 0) {
    return [];
  }

  // 2. Gera os placeholders ($1, $2, $3, ...) dinamicamente
  // Para cada item no array, criamos uma string '$' seguida do seu índice + 1.
  const placeholders = eans.map((_, index) => `$${index + 1}`).join(", ");
  // Para [57530, 65573, 98765], o resultado será: "$1, $2, $3"

  try {
    // 3. Monta a string final da consulta SQL
    const sqlQuery = `
        SELECT
            ean,
            description,
            brand
        FROM
            public.products
        WHERE
            ean IN(${placeholders});
    `;

    const result = await pool.query(sqlQuery.trim(), eans);

    return result.rows.map(convertKeysToCamelCase);
  } catch (error) {
    console.error(
      `[Invoice] Erro ao consultar produtos por EANs:`,
      error.message
    );
    throw new Error(`Erro ao consultar produtos`);
  }
};

const getInfoInvoiceFromExternalApi = async (fiscalCode) => {
  try {
    const response = await axios.get(
      `${EXTERNAL_API_URL}?chv_acs=${fiscalCode}`,
      {
        headers: {
          Authorization: `Basic ${EXTERNAL_API_AUTH}`,
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(
        `API externa retornou status ${response.status}: ${response.data}`
      );
    }

    const jsonObject = response.data;
    //console.log(`[jsonObject]`, jsonObject);
    const bandeira = jsonObject.bandeira;
    const hasCreditcard = hasCreditcardInInvoice(bandeira);
    const hasPartnerCode = hasPartnerCodeInInvoice(jsonObject);
    const productsInInvoice = await getProductsInInvoice(jsonObject);
    const hasItem = productsInInvoice.length > 0;

    return {
      invoceValue: parseFloat(jsonObject.valor_total),
      hasItem: hasItem,
      hasCreditcard: hasCreditcard,
      hasPartnerCode: hasPartnerCode,
      pdv: parseInt(jsonObject.num_pdv),
      store: parseInt(jsonObject.num_loja),
      numCoupon: parseInt(jsonObject.num_cupom),
      cnpj: jsonObject.cnpj.toString(),
      creditcard: bandeira,
      productsInInvoice: productsInInvoice, // Inclui os produtos na resposta
    };
  } catch (error) {
    console.error(
      `Erro ao consultar API externa com fiscalCode ${fiscalCode}:`,
      error.message
    );
    throw new Error(
      `Falha ao obter informações da nota fiscal`
    );
  }
};

// Função para calcular total de chances no jogo
const getTotalGameChances = (invoiceData) => {
  if (!invoiceData.invoceValue) {
    throw new Error("Não foi possível recuperar o valor da nota fiscal");
  }

  const referenceValue = MINIMUM_FISCAL_NOTE_VALUE;
  if (invoiceData.invoceValue < referenceValue) {
    throw new Error(
      `O valor da nota deve ser maior ou igual a R\$ ${MINIMUM_FISCAL_NOTE_VALUE},00`
    );
  }

  // Calcula quantas vezes o valor mínimo cabe no valor da nota (arredondado para baixo)
  let totalGameChances = Math.floor(invoiceData.invoceValue / referenceValue);

  // Dobra as chances se tiver produto, cartão de crédito ou código de parceiro
  if (
    invoiceData.hasItem ||
    invoiceData.hasCreditcard ||
    invoiceData.hasPartnerCode
  ) {
    totalGameChances *= 2;
  }

  return totalGameChances;
};

// Função para gerar número da sorte único
const generateDrawNumber = async (repository) => {
  let number;
  let exists;

  do {
    // Gera número aleatório entre 1 e 9999999
    number = Math.floor(Math.random() * 9999999) + 1;

    // Verifica se o número já existe
    const checkResult = await repository.query(
      "SELECT id FROM draw_numbers WHERE number = $1",
      [number]
    );
    exists = checkResult.rows.length > 0;
  } while (exists);

  return formatNumberWithZeros(number, 8);
};

// --- Função getAll customizada para invoices (com JOIN) ---
const getAllInvoicesWithClientName = async (req, res, next) => {
  try {
    const { whereClause, params, currentPage, limit, offset, nextParamIndex } =
      buildQuery({
        tableName: tableName,
        queryParams: req.query,
        searchableFields: searchableFields,
        enableDateFiltering: true,
        orderBy: req.query.orderBy || "created_at",
        orderDirection: req.query.orderDirection || "DESC",
      });

    // Query para contagem total
    const countQuery = `SELECT COUNT(*) FROM ${tableName} ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const totalEntities = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalEntities / limit);

    // Query principal com JOIN
    const orderByField = toSnakeCase(req.query.orderBy || "created_at");
    const orderDirection = req.query.orderDirection || "DESC";

    let query = `
      SELECT 
        i.*, 
        c.name as client_name,
        c.cpf as client_cpf,
        c.email as client_email
      FROM ${tableName} i
      JOIN clients c ON i.client_id = c.id
      ${whereClause} 
      ORDER BY ${orderByField} ${orderDirection} 
      LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}`;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    res.status(200).json({
      status: "success",
      data: result.rows.map(convertKeysToCamelCase),
      pagination: {
        totalEntities,
        totalPages,
        currentPage,
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
};

const invoiceTransaction = async (fiscalCode, clientId, repository) => {
  // 1. Obter informações da API externa
  const invoiceExternalData = await getInfoInvoiceFromExternalApi(fiscalCode);
  const productsInInvoice = invoiceExternalData.productsInInvoice;
  delete invoiceExternalData.productsInInvoice; // Remove produtos para não duplicar no insert

  // 2. Calcular total de chances no jogo
  const totalGameChances = getTotalGameChances(invoiceExternalData);

  // 3. Preparar dados completos da fatura
  const completeInvoiceData = {
    fiscalCode,
    clientId,
    ...invoiceExternalData,
  };

  // 4. Inserir a fatura no banco de dados
  const invoiceFields = creatableFields
    .map((field) => toSnakeCase(field))
    .join(", ");
  const invoiceValues = creatableFields
    .map((_, index) => `$${index + 1}`)
    .join(", ");
  const invoiceParams = creatableFields.map(
    (field) => completeInvoiceData[field]
  );

  const invoiceSql = `INSERT INTO ${tableName} (${invoiceFields}) VALUES (${invoiceValues}) RETURNING *`;
  const invoiceResult = await repository.query(invoiceSql, invoiceParams);
  const createdInvoice = invoiceResult.rows[0];

  // 5. Criar oportunidades de jogo e números da sorte
  const gameOpportunities = [];
  const drawNumbers = [];

  for (let i = 0; i < totalGameChances; i++) {
    // Criar GameOpportunity
    const gameOpportunityResult = await repository.query(
      `INSERT INTO game_opportunities (invoice_id, gift, active, created_at, updated_at) 
         VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
      [createdInvoice.id, null, true] // gift é null inicialmente, active é true
    );
    gameOpportunities.push(gameOpportunityResult.rows[0].id * 1);

    // Gerar número da sorte único
    const drawNumber = await generateDrawNumber(repository);

    // Criar DrawNumber
    await repository.query(
      `INSERT INTO draw_numbers (invoice_id, number, active, created_at, updated_at) 
         VALUES ($1, $2, $3, NOW(), NOW())`,
      [createdInvoice.id, drawNumber, true] // active é true
    );
    drawNumbers.push(drawNumber);
  }

  // 6. Buscar informações adicionais para a resposta
  // Total de faturas do cliente
  const totalInvoicesResult = await repository.query(
    "SELECT COUNT(*) FROM invoices WHERE client_id = $1",
    [clientId]
  );
  const totalInvoices = parseInt(totalInvoicesResult.rows[0].count, 10);

  // Total de chances de jogo do cliente
  const totalGameChancesResult = await repository.query(
    `SELECT COUNT(*) FROM game_opportunities go 
       JOIN invoices i ON go.invoice_id = i.id 
       WHERE i.client_id = $1`,
    [clientId]
  );
  const totalClientGameChances = parseInt(
    totalGameChancesResult.rows[0].count,
    10
  );

  await repository.query("COMMIT"); // Confirma a transação
  //await repository.query("ROLLBACK"); // só para testes

  delete createdInvoice.id;
  delete createdInvoice.cnpj;
  delete createdInvoice.client_id;
  delete createdInvoice.creditcard;

  // 8. Preparar resposta detalhada
  return {
    invoice: convertKeysToCamelCase(createdInvoice),
    totalInvoices: totalInvoices,
    totalGameChances: totalClientGameChances,
    invoiceGameChances: totalGameChances,
    drawNumbers,
    gameOpportunities,
    products: productsInInvoice,
  };
};

// --- Função CREATE customizada com transação ---
const createInvoiceWithTransaction = async (req, res, next) => {
  const repository = await pool.connect(); // Obtém uma conexão específica para a transação

  try {
    await repository.query("BEGIN"); // Inicia a transação

    const { fiscalCode, clientId } = req.body;

    if (!fiscalCode || !clientId) {
      throw new Error(
        "fiscalCode e clientId são obrigatórios para criar uma fatura."
      );
    }

    const response = await invoiceTransaction(fiscalCode, clientId, repository);

    // 7. Log de auditoria
    await logActivity(
      req.user.id,
      "CREATE_INVOICE",
      { type: "invoices", id: createdInvoice.id },
      {
        requestBody: req.body,
        totalGameChances,
        invoice: invoiceExternalData.invoceValue,
      }
    );

    res.status(201).json({
      status: "success",
      message: "Fatura criada com sucesso",
      data: response,
    });
  } catch (error) {
    await repository.query("ROLLBACK"); // Desfaz a transação em caso de erro
    console.error(
      "[Invoice Create] Erro durante criação da fatura:",
      error.message
    );
    next(error);
  } finally {
    repository.release(); // Libera a conexão de volta para o pool
  }
};

const addInvoiceWithTransaction = async (req, res, next) => {
  const repository = await pool.connect(); // Obtém uma conexão específica para a transação

  try {
    await repository.query("BEGIN"); // Inicia a transação

    const { fiscalCode } = req.body;

    if (!fiscalCode) {
      throw new Error("fiscalCode são obrigatórios para criar uma fatura.");
    }

    const token = req.user.userToken;
    const { rows } = await repository.query(
      `SELECT * FROM clients WHERE token = $1`,
      [token]
    );
    console.log('token', {token, rows});
    if (rows.length === 0) {
      throw new Error(`Cliente não encontrado.`);
    }
    const client = rows[0];

    const response = await invoiceTransaction(
      fiscalCode,
      client.id,
      repository
    );

    delete response.gameOpportunities; // Remove gameOpportunities do response

    res.status(201).json({
      status: "success",
      message: "Fatura criada com sucesso",
      data: response,
    });
  } catch (error) {
    await repository.query("ROLLBACK"); // Desfaz a transação em caso de erro
    console.error(
      "[Invoice ADD] Erro durante criação da fatura:",
      error.message
    );
    next(error);
  } finally {
    repository.release(); // Libera a conexão de volta para o pool
  }
};

// --- Rota para o Sorteio "Tente a Sorte" ---
const tryMyLuck = async (req, res, next) => {
  const repository = await pool.connect();
  try {
    await repository.query("BEGIN");

    // 1. Identificar o cliente pelo token
    const token = req.user.userToken;
    const clientResult = await repository.query(
      `SELECT id FROM clients WHERE token = $1`,
      [token]
    );

    if (clientResult.rows.length === 0) {
      throw new Error("Cliente não encontrado.");
    }
    const clientId = clientResult.rows[0].id;

    // 2.1. Verificar se o cliente tem oportunidades ativas e não utilizadas
    const opportunityResult = await repository.query(
      `SELECT go.id
       FROM game_opportunities go
       JOIN invoices i ON go.invoice_id = i.id
       WHERE go.active = true AND go.used_at IS NULL AND i.client_id = $1
       ORDER BY go.created_at ASC
       LIMIT 1`,
      [clientId]
    );

    if (opportunityResult.rows.length === 0) {
      await repository.query("ROLLBACK");
      return res
        .status(404)
        .json({ win: false, gift: "Nenhuma oportunidade disponível." });
    }
    const opportunityId = opportunityResult.rows[0].id;

    // Verificação: Cliente já ganhou um voucher anteriormente?
    const hasWonBeforeResult = await repository.query(
      `SELECT v.id FROM vouchers v
       JOIN game_opportunities go ON v.game_opportunity_id = go.id
       JOIN invoices i ON go.invoice_id = i.id
       WHERE i.client_id = $1`,
      [clientId]
    );

    let alreadyWon = hasWonBeforeResult.rows.length > 0;
    let giftMessage;
    let winStatus;
    let voucherCoupom = null;

    if (alreadyWon) {
      giftMessage = "Não foi dessa vez";
      winStatus = false;
    } else {
      // 2.2. Tenta encontrar e bloquear um voucher disponível para o sorteio
      const voucherResult = await repository.query(
        `SELECT id, coupom FROM vouchers
           WHERE draw_date <= now() AND game_opportunity_id IS NULL
           ORDER BY draw_date ASC
           LIMIT 1
           FOR UPDATE`
      );

      if (voucherResult.rows.length > 0) {
        // 2.3. Ganhou! Atualiza o voucher
        const voucher = voucherResult.rows[0];
        await repository.query(
          `UPDATE vouchers SET game_opportunity_id = $1, updated_at = now() WHERE id = $2`,
          [opportunityId, voucher.id]
        );
        giftMessage = "Parabéns você ganhou um voucher";
        winStatus = true;
        voucherCoupom = voucher.coupom;
      } else {
        // Não ganhou. Apenas atualiza a oportunidade
        giftMessage = "Não foi dessa vez";
        winStatus = false;
      }
    }

    // Common update for game_opportunities and response
    await repository.query(
      `UPDATE game_opportunities SET gift = $1, used_at = now(), updated_at = now() WHERE id = $2`,
      [giftMessage, opportunityId]
    );

    await repository.query("COMMIT");

    return res
      .status(200)
      .json({ win: winStatus, gift: giftMessage, voucher: voucherCoupom });
  } catch (error) {
    await repository.query("ROLLBACK");
    next(error);
  } finally {
    repository.release();
  }
};

// --- Criação dos Handlers CRUD para Faturas (sem o create customizado) ---
const invoiceCrud = createCrudHandlers({
  pool,
  tableName,
  idField,
  creatableFields,
  updatableFields,
  logActivity,
  defaultOrderBy: "createdAt",
  defaultOrderDirection: "DESC",
  // Removemos o additionalLogic.preCreate pois agora temos um create customizado
});

// --- Criação do Handler de Exportação para Faturas ---
const exportInvoicesHandler = createExportHandler({
  pool,
  tableName,
  logActivity,
  columnsConfig: invoiceExportColumns,
  searchableFields,
});

router.post(
  "/add",
  authenticateToken,
  authorizeRoles("web"),
  addInvoiceValidationRules,
  invoiceValidationErrors,
  addInvoiceWithTransaction
);

router.get("/try-my-luck", authenticateToken, authorizeRoles("web"), tryMyLuck);

// --- Aplicação de Middlewares ---
router.use(authenticateToken, authorizeRoles("admin"));

router.get("/export", exportInvoicesHandler);

// --- Definição das Rotas ---
router.get("/", getAllInvoicesWithClientName);
router.post(
  "/",
  invoiceValidationRules,
  invoiceValidationErrors,
  createInvoiceWithTransaction
); // CREATE customizado
router.get("/:id", invoiceCrud.getById);
//router.put('/:id', invoiceValidationRules, invoiceValidationErrors, invoiceCrud.update);
router.delete("/:id", invoiceCrud.remove);

module.exports = router;
