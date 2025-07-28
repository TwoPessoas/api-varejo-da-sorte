const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // Importa o pool de conexões
const crypto = require("crypto");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");
const {
  clientValidationRules,
  clientValidationErrors,
} = require("../validators/clienteValidador");
const { logActivity } = require("../utils/logger");
const { convertKeysToCamelCase, toSnakeCase } = require("../utils/objectUtils");
const { stringify } = require("csv-stringify");
const ExcelJS = require("exceljs");
const { generateClientsPDF } = require("../utils/pdfUtils");

// Protege todas as rotas para serem acessíveis apenas por 'admin'
router.use(authenticateToken, authorizeRoles("admin"));

/*
const { isArray, isObject } = require("util");

const { clientMaskInfo } = require("../utils/maskInfo");

// Rotas Públicas (não requerem autenticação)
// Esta rota deve vir ANTES das rotas com /:id para evitar conflitos de matching
router.get(
    "/findByCpf/:cpf",
    findByCpfRules, // Valida o formato do CPF na URL
    clientValidationErrors,// Trata os erros de validação
    async (req, res, next) => {
        try {
            const cpfParam = req.params.cpf;

            // 1. Tenta encontrar o cliente pelo CPF
            const [rows] = await pool.query('SELECT * FROM clients WHERE cpf = $1', [cpfParam]);
            
            let cliente;

            if (rows.length > 0) {
                // 2a. Se encontrou, usa o cliente existente
                cliente = rows[0];
            } else {
                // 2b. Se NÃO encontrou, cria um novo cliente (pré-registro)
                const sqlInsert = 'INSERT INTO clients (cpf, isPreRegister) VALUES ($1, $2) RETURNING *';
                const result = await pool.query(sqlInsert, [cpfParam, true]);

                cliente = result.rows[0];
            }
            
            // 4. Mascara os dados antes de enviar a resposta
            const dadosMascarados = mascararDadosCliente(cliente);

            // 5. Retorna uma resposta 200 OK com os dados mascarados
            res.status(200).json({
                status: "success",
                data: dadosMascarados,
            });

        } catch (error) {
            next(error);
        }
    }
);*/

router.get("/export", async (req, res, next) => {
  try {
    // 1. Obter e parsear os parâmetros da query
    const { search, startDate, endDate, format = "csv" } = req.query; // Padrão 'csv'

    let searchFilters = {};
    if (search) {
      try {
        searchFilters = JSON.parse(search);
      } catch (e) {
        console.warn("Invalid search JSON provided:", search);
        return res.status(400).json({
          status: "error",
          message: "Parâmetro 'search' inválido (JSON).",
        });
      }
    }

    let whereClause = " WHERE 1=1 ";
    const queryParams = [];

    // Adicionar filtros de busca
    Object.keys(searchFilters).forEach((key) => {
      const value = searchFilters[key];
      if (value !== undefined && value !== null && value !== "") {
        const snakeKey = toSnakeCase(key);
        whereClause += ` AND ${snakeKey} ILIKE $${queryParams.length + 1}`;
        queryParams.push(`%${value}%`);
      }
    });

    // Adicionar filtro por data de criação (created_at)
    if (startDate) {
      // Garante que a data de início inclua o dia inteiro
      whereClause += ` AND created_at >= $${queryParams.length + 1}`;
      queryParams.push(new Date(startDate).toISOString()); // Converte para formato ISO para Postgress
    }
    if (endDate) {
      // Garante que a data de fim inclua o dia inteiro (até o final do dia)
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999); // Define para o final do dia
      whereClause += ` AND created_at <= $${queryParams.length + 1}`;
      queryParams.push(endOfDay.toISOString());
    }

    // Montar a query SQL completa
    const sql = `SELECT * FROM clients ${whereClause} ORDER BY name ASC`;

    // 2. Buscar os dados do banco de dados
    const result = await pool.query(sql, queryParams);
    const clientsToExport = result.rows;

    // --- LOG DE AUDITORIA ---
    await logActivity(
      req.user.id,
      "EXPORT_CLIENTS",
      { type: "clients_export", filters: req.query },
      { exportedCount: clientsToExport.length }
    );
    // --- FIM DO LOG ---

    // Definir os cabeçalhos das colunas para CSV e XLSX
    const columns = [
      { key: "id", header: "ID", width: 10 },
      { key: "name", header: "Nome", width: 30 },
      { key: "cpf", header: "CPF", width: 20 },
      { key: "birthday", header: "Data de Aniversário", width: 20 },
      { key: "cel", header: "Celular", width: 20 },
      { key: "email", header: "Email", width: 30 },
      { key: "is_pre_register", header: "Pré-Cadastro", width: 15 },
      { key: "is_mega_winner", header: "Mega Ganhador", width: 15 },
      { key: "email_sended_at", header: "Email Enviado Em", width: 25 },
      { key: "created_at", header: "Criado Em", width: 25 },
      { key: "updated_at", header: "Atualizado Em", width: 25 },
    ];

    // 3. Gerar o arquivo no formato solicitado
    if (format === "csv") {
      stringify(
        clientsToExport,
        {
          header: true,
          columns: columns.map((col) => ({ key: col.key, header: col.header })), // Mapeia para o formato esperado pelo stringify
          cast: {
            date: (value) => (value ? new Date(value).toISOString() : ""), // Converte datas para string ISO
            boolean: (value) => (value ? "Sim" : "Não"), // Converte booleanos para 'Sim'/'Não'
          },
        },
        (err, output) => {
          if (err) {
            console.error("Error generating CSV:", err);
            return next(err);
          }

          res.setHeader("Content-Type", "text/csv");
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="clientes_export.csv"'
          );
          res.status(200).send(output);
        }
      );
    } else if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Clientes");

      // Define as colunas do worksheet (com cabeçalhos e chaves)
      worksheet.columns = columns; // ExcelJS aceita diretamente a estrutura de columns

      // Adiciona os dados das linhas
      // É bom pré-processar os dados para que as datas e booleanos sejam formatados
      const mappedClients = clientsToExport.map((client) => {
        return {
          ...client,
          // Formata datas para string legível
          birthday: client.birthday
            ? new Date(client.birthday).toLocaleDateString("pt-BR")
            : "",
          created_at: client.created_at
            ? new Date(client.created_at).toLocaleString("pt-BR")
            : "",
          updated_at: client.updated_at
            ? new Date(client.updated_at).toLocaleString("pt-BR")
            : "",
          // Formata booleanos
          is_pre_register: client.is_pre_register ? "Sim" : "Não",
          is_mega_winner: client.is_mega_winner ? "Sim" : "Não",
          // O token, se incluído nas columns, também pode ser formatado ou ocultado
          // token: client.token ? '***' : ''
        };
      });

      worksheet.addRows(mappedClients);

      // Gerar o buffer do arquivo XLSX
      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="clientes_export.xlsx"'
      );
      res.status(200).send(buffer);
    } else if (format === "pdf") {
      // Gerar PDF usando pdfmake
      const pdfDoc = generateClientsPDF(clientsToExport, searchFilters, {
        startDate,
        endDate,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="clientes_export.pdf"'
      );

      // Pipe o documento PDF diretamente para a resposta
      pdfDoc.pipe(res);
      pdfDoc.end();
    } else {
      res
        .status(400)
        .json({ status: "error", message: "Formato de exportação inválido." });
    }
  } catch (error) {
    next(error);
  }
});

// Rota para CRIAR um novo client (CREATE)
// Apenas 'admin' pode criar.
router.post(
  "/",
  clientValidationRules, // Aplica as regras de validação
  clientValidationErrors, // Trata os erros de validação
  async (req, res, next) => {
    try {
      const { isPreRegister, name, cpf, birthday, cel, email } = req.body;

      // 2. GERAR O TOKEN SEGURO
      // crypto.randomBytes(32) gera 32 bytes de dados aleatórios.
      // .toString('hex') converte esses bytes para uma string hexadecimal de 64 caracteres.
      const newToken = crypto.randomBytes(32).toString("hex");

      // 3. SQL
      // Incluímos as colunas `token`, `createdAt` e `updatedAt`.
      // Usamos a função NOW() do PostgreSQL para garantir o timestamp do banco de dados,
      // que é a prática mais robusta.
      const sql = `INSERT INTO clients 
                            (is_pre_register, name, cpf, birthday, cel, email, token)
                         VALUES 
                            ($1, $2, $3, $4, $5, $6, $7) 
                         RETURNING *`;

      // 4. ADICIONAR O TOKEN GERADO AOS PARÂMETROS
      const params = [isPreRegister, name, cpf, birthday, cel, email, newToken];

      const result = await pool.query(sql, params);

      // --- LOG DE AUDITORIA ---
      await logActivity(
        req.user.id, // ID do usuário logado, vindo do token JWT
        "CREATE_CLIENT",
        { type: "clients", id: result.rows[0].id },
        { requestBody: req.body } // Guardando o corpo da requisição como detalhe
      );
      // --- FIM DO LOG ---

      const clientFromDb = result.rows[0];
      const clientForFrontend = convertKeysToCamelCase(clientFromDb);

      res.status(201).json({
        status: "success",
        message: "Cliente criado com sucesso.",
        data: clientForFrontend,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Rota para LER todos os clients (READ ALL)
// Apenas 'admin' pode ler.
router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const searchParam = req.query.search ? JSON.parse(req.query.search) : {};
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM clients";
    let countQuery = "SELECT COUNT(*) FROM clients";
    let where = " WHERE 1=1 ";
    const params = [];

    // Aplicar filtros da busca JSON
    Object.keys(searchParam).forEach((key) => {
      const value = searchParam[key];
      if (value !== undefined && value !== null && value !== "") {
        const snakeKey = toSnakeCase(key); // Converte para snake_case
        // Usa ILIKE para busca case-insensitive e % para correspondência parcial
        where += ` AND ${snakeKey} ILIKE $${params.length + 1}`;
        params.push(`%${value}%`);
      }
    });

    // Construir a query de contagem
    countQuery += where;
    const countResult = await pool.query(countQuery, params);
    const totalEntities = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalEntities / limit);

    // Adicionar ordenação, limite e offset à query principal
    query += where;
    query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset); // Adiciona limit e offset aos parâmetros

    const result = await pool.query(query, params);

    res.status(200).json({
      status: "success",
      data: result.rows,
      pagination: {
        totalEntities,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Rota para LER um client específico por ID (READ ONE)
// Apenas 'admin' podem ler.
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM clients WHERE id = $1", [
      id,
    ]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Cliente não encontrado." });
    }
    const clientFromDb = rows[0];
    const clientForFrontend = convertKeysToCamelCase(clientFromDb);
    res.status(200).json(clientForFrontend);
  } catch (error) {
    next(error);
  }
});

// Rota para ATUALIZAR um client (UPDATE)
// Apenas 'admin' pode atualizar.
router.put(
  "/:id",
  clientValidationRules,
  clientValidationErrors,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, cpf, birthday, cel, email, isPreRegister } = req.body;

      // MUDANÇA: A cláusula `updatedAt` é definida explicitamente
      const sql = `UPDATE clients SET 
                            is_pre_register = $1, name = $2, cpf = $3, birthday = $4, 
                            cel = $5, email = $6, updated_at = NOW()
                         WHERE id = $7
                         RETURNING *`;
      const params = [isPreRegister, name, cpf, birthday, cel, email, id];

      const result = await pool.query(sql, params);
      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ status: "error", message: "Cliente não encontrado." });
      }

      // --- LOG DE AUDITORIA ---
      await logActivity(
        req.user.id, // ID do usuário logado, vindo do token JWT
        "UPDATE_CLIENT",
        { type: "clients", id },
        { requestBody: req.body } // Guardando o corpo da requisição como detalhe
      );
      // --- FIM DO LOG ---

      const clientFromDb = result.rows[0];
      const clientForFrontend = convertKeysToCamelCase(clientFromDb);
      res.status(200).json({
        status: "success",
        message: "Cliente atualizado com sucesso.",
        data: clientForFrontend,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Rota para DELETAR um client (DELETE)
// Apenas 'admin' pode deletar.
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM clients WHERE id = $1", [id]);
    // MUDANÇA: de affectedRows para rowCount
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Cliente não encontrado." });
    }

    // --- LOG DE AUDITORIA ---
    await logActivity(
      req.user.id, // ID do usuário logado, vindo do token JWT
      "DELETE_CLIENT",
      { type: "clients", id },
      { requestBody: req.body } // Guardando o corpo da requisição como detalhe
    );
    // --- FIM DO LOG ---

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
