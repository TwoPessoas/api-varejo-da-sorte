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
} = require("../validators/invoiceValidador");

// --- Configurações Específicas da Entidade Fatura ---
const tableName = "invoices";
const idField = "id";

// Configurações de Negócio
const MINIMUM_FISCAL_NOTE_VALUE = 50; // R\$ 50,00 - valor mínimo para participar

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
  
  const allEans = products.map(product => product.ean);
  
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
    const placeholders = eans.map((_, index) => `$${index + 1}`).join(', ');
    // Para [57530, 65573, 98765], o resultado será: "$1, $2, $3"

    try{
    // 3. Monta a string final da consulta SQL
    const sqlQuery = `
        SELECT
            id,
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
        console.error(`[Invoice] Erro ao consultar produtos por EANs:`, error.message);
        throw new Error(`Erro ao consultar produtos: ${error.message}`);
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
      creditcard: JSON.stringify(bandeira),
      productsInInvoice: productsInInvoice, // Inclui os produtos na resposta
    };
  } catch (error) {
    console.error(
      `Erro ao consultar API externa com fiscalCode ${fiscalCode}:`,
      error.message
    );
    throw new Error(
      `Falha ao obter informações da nota fiscal: ${error.message}`
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
const generateDrawNumber = async (client) => {
  let number;
  let exists;

  do {
    // Gera número aleatório entre 1 e 9999999
    number = Math.floor(Math.random() * 9999999) + 1;

    // Verifica se o número já existe
    const checkResult = await client.query(
      "SELECT id FROM draw_numbers WHERE number = $1",
      [number]
    );
    exists = checkResult.rows.length > 0;
  } while (exists);

  return number;
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

// --- Função CREATE customizada com transação ---
const createInvoiceWithTransaction = async (req, res, next) => {
  const client = await pool.connect(); // Obtém uma conexão específica para a transação

  try {
    await client.query("BEGIN"); // Inicia a transação

    const { fiscalCode, clientId } = req.body;

    if (!fiscalCode || !clientId) {
      throw new Error(
        "fiscalCode e clientId são obrigatórios para criar uma fatura."
      );
    }

    // 1. Obter informações da API externa
    /*console.log(
      `[Invoice Create] Consultando API externa para fiscalCode: ${fiscalCode}`
    );*/

    const invoiceExternalData = await getInfoInvoiceFromExternalApi(fiscalCode);
    const productsInInvoice = invoiceExternalData.productsInInvoice;
    delete invoiceExternalData.productsInInvoice; // Remove produtos para não duplicar no insert

    // 2. Calcular total de chances no jogo
    const totalGameChances = getTotalGameChances(invoiceExternalData);
    /*console.log(
      `[Invoice Create] Total de chances calculadas: ${totalGameChances}`
    );*/

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
    const invoiceResult = await client.query(invoiceSql, invoiceParams);
    const createdInvoice = invoiceResult.rows[0];

    //console.log(`[Invoice Create] Fatura criada com ID: ${createdInvoice.id}`);

    // 5. Criar oportunidades de jogo e números da sorte
    const gameOpportunities = [];
    const drawNumbers = [];

    for (let i = 0; i < totalGameChances; i++) {
      // Criar GameOpportunity
      const gameOpportunityResult = await client.query(
        `INSERT INTO game_opportunities (invoice_id, gift, active, created_at, updated_at) 
         VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *`,
        [createdInvoice.id, null, true] // gift é null inicialmente, active é true
      );
      gameOpportunities.push(gameOpportunityResult.rows[0]);

      // Gerar número da sorte único
      const drawNumber = await generateDrawNumber(client);

      // Criar DrawNumber
      const drawNumberResult = await client.query(
        `INSERT INTO draw_numbers (invoice_id, number, active, created_at, updated_at) 
         VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *`,
        [createdInvoice.id, drawNumber, true] // active é true
      );
      drawNumbers.push(drawNumberResult.rows[0]);
    }

    // 6. Buscar informações adicionais para a resposta
    // Total de faturas do cliente
    const totalInvoicesResult = await client.query(
      "SELECT COUNT(*) FROM invoices WHERE client_id = $1",
      [clientId]
    );
    const totalInvoices = parseInt(totalInvoicesResult.rows[0].count, 10);

    // Total de chances de jogo do cliente
    const totalGameChancesResult = await client.query(
      `SELECT COUNT(*) FROM game_opportunities go 
       JOIN invoices i ON go.invoice_id = i.id 
       WHERE i.client_id = $1`,
      [clientId]
    );
    const totalClientGameChances = parseInt(
      totalGameChancesResult.rows[0].count,
      10
    );

    await client.query("COMMIT"); // Confirma a transação

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

    // 8. Preparar resposta detalhada
    const response = {
      invoice: convertKeysToCamelCase(createdInvoice),
      totalInvoices: totalInvoices,
      totalGameChances: totalClientGameChances,
      invoiceGameChances: totalGameChances,
      drawNumbers: drawNumbers.map(convertKeysToCamelCase),
      gameOpportunities: gameOpportunities.map(convertKeysToCamelCase),
      products: productsInInvoice.map(convertKeysToCamelCase),
    };

    /*console.log(
      `[Invoice Create] Processo concluído com sucesso para fatura ID: ${createdInvoice.id}`
    );*/

    res.status(201).json({
      status: "success",
      message: "Fatura criada com sucesso",
      data: response,
    });
  } catch (error) {
    await client.query("ROLLBACK"); // Desfaz a transação em caso de erro
    console.error(
      "[Invoice Create] Erro durante criação da fatura:",
      error.message
    );
    next(error);
  } finally {
    client.release(); // Libera a conexão de volta para o pool
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
