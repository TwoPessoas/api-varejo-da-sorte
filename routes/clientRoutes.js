// src/routes/clientRoutes.js (ou client.routes.js, etc., conforme sua convenção de nomes)
const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // Seu pool de conexão com o banco de dados
const crypto = require("crypto");

// Middlewares e Utils Genéricos
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");
const { logActivity } = require("../utils/logger");
const { createCrudHandlers } = require("../utils/crudHandlers"); // Importa a factory de CRUD
const { createExportHandler } = require("../utils/exportHandlers"); // Importa a factory de Exportação

// Validações Específicas do Cliente
const {
  clientValidationRules,
  clientUpdateValidationRules,
  clientValidationErrors,
} = require("../validators/clienteValidador");
const { clientMaskInfo } = require("../utils/maskInfo");
const { convertKeysToCamelCase } = require("../utils/objectUtils");
const { sendWelcomeEmail } = require("../services/emailService");

// --- Configurações Específicas da Entidade Cliente ---
const tableName = "clients";
const idField = "id"; // Campo da chave primária

// Campos que podem ser criados (camelCase)
const creatableFields = [
  "isPreRegister",
  "name",
  "cpf",
  "birthday",
  "cel",
  "email",
  "token",
];

// Campos que podem ser atualizados (camelCase)
const updatableFields = [
  "isPreRegister",
  "name",
  "cpf",
  "birthday",
  "cel",
  "email",
];

// Campos que podem ser pesquisados/filtrados na listagem e exportação (camelCase)
const searchableFields = ["name", "cpf", "cel", "email"];

// Definição das colunas para exportação (header, key, width para XLSX/PDF)
const clientExportColumns = [
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
  {
    key: "updated_security_token_at",
    header: "Token de segurança atualizado em",
    width: 25,
  },
];

// --- Criação dos Handlers CRUD para Clientes ---
const clientCrud = createCrudHandlers({
  pool,
  tableName,
  idField,
  creatableFields,
  updatableFields,
  logActivity,
  defaultOrderBy: "name",
  defaultOrderDirection: "ASC",
  // Lógica adicional específica do cliente (ex: gerar token antes de criar)
  additionalLogic: {
    preCreate: async (data) => {
      const newToken = crypto.randomBytes(32).toString("hex");
      return { ...data, token: newToken };
    },
    // Você pode adicionar um preUpdate, postCreate, postUpdate, etc., se necessário
  },
});

// --- Criação do Handler de Exportação para Clientes ---
const exportClientsHandler = createExportHandler({
  pool,
  tableName,
  logActivity,
  columnsConfig: clientExportColumns,
  searchableFields,
});

const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      status: "success",
    });
  } catch (error) {
    next(error);
  }
};

const getClientWebByToken = async (req, res, next) => {
  try {
    const token = req.user.userToken;
    const { rows } = await pool.query(
      `SELECT * FROM clients WHERE token = $1`,
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: `Cliente não encontrado.`,
      });
    }

    var clientTO = clientMaskInfo(rows[0]);
    res.status(200).json(convertKeysToCamelCase(clientTO));
  } catch (error) {
    next(error);
  }
};

const getClientWebSummary = async (req, res, next) => {
  try {
    const token = req.user.userToken;

    const response = {
      opportunitiesTotal: 0,
      opportunitiesNotUsed: 0,
      drawNumbersTotal: 0,
      invoicesTotal: 0,
    };

    /* Oportunidades de Jogo */
    let result = await pool.query(
      `SELECT go.used_at
       FROM game_opportunities go
       JOIN invoices i ON i.id = go.invoice_id
       JOIN clients c ON i.client_id = c.id
       WHERE c.token = $1`,
      [token]
    );

    if (result.rows.length > 0) {
      const total = result.rows.length;
      const notUsed = result.rows.filter((el) => el.used_at === null);
      response.opportunitiesTotal = total;
      response.opportunitiesNotUsed = notUsed.length;
    }

    /* Numeros da Sorte */
    result = await pool.query(
      `SELECT count(d.id) total
       FROM draw_numbers d
       JOIN invoices i ON d.invoice_id = i.id
       JOIN clients c ON i.client_id = c.id
       WHERE c.token = $1`,
      [token]
    );

    if (result.rows.length > 0) {
      response.drawNumbersTotal = result.rows[0]["total"];
    }

    /* Notas Fiscais */
    result = await pool.query(
      `SELECT count(i.id) total
       FROM invoices i
       JOIN clients c ON i.client_id = c.id
       WHERE c.token = $1`,
      [token]
    );

    if (result.rows.length > 0) {
      response.invoicesTotal = result.rows[0]["total"];
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

const updatedClientWebByToken = async (req, res, next) => {
  try {
    const token = req.user.userToken;
    const { rows } = await pool.query(
      `SELECT * FROM clients WHERE token = $1`,
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: `Cliente não encontrado.`,
      });
    }

    const user = rows[0];
    const { birthday, cel, email, name } = req.body;

    const request = await pool.query(
      "UPDATE clients SET is_pre_register=$1, birthday=$2, cel=$3, email=$4, name=$5 WHERE id=$6 RETURNING *",
      [false, birthday, cel, email ? email : user.email, name, user.id]
    );

    const clientUltaded = request.rows[0];
    if (clientUltaded.email && clientUltaded.welcome_email_sended_at === null) {
      // Tenta enviar um e-mail de boas vindas
      welcomeEmail(clientUltaded.id, clientUltaded.email, clientUltaded.name);
    }

    var clientTO = clientMaskInfo(request.rows[0]);
    res.status(200).json(convertKeysToCamelCase(clientTO));
  } catch (error) {
    next(error);
  }
};

const welcomeEmail = async (id, email, name) => {
  try {
    // Envio do email
    await sendWelcomeEmail({ email, name });
    await pool.query(
      "UPDATE clients SET welcome_email_sended_at=now(), updated_at=now() WHERE id=$1",
      [id]
    );
    console.log("Email enviado com sucesso!");
  } catch (error) {
    console.error("Erro ao enviar o email:", error);
  }
};

router.get("/me", authenticateToken, authorizeRoles("web"), getMe);
router.get(
  "/web",
  authenticateToken,
  authorizeRoles("web"),
  getClientWebByToken
);
router.get(
  "/summary",
  authenticateToken,
  authorizeRoles("web"),
  getClientWebSummary
);
router.put(
  "/web",
  authenticateToken,
  authorizeRoles("web"),
  clientUpdateValidationRules,
  clientValidationErrors,
  updatedClientWebByToken
);

// --- Aplicação de Middlewares de Autenticação e Autorização para TODAS as rotas de cliente ---
router.use(authenticateToken, authorizeRoles("admin"));

// --- Definição da Rota de Exportação ---
router.get("/export", exportClientsHandler);

// --- Definição das Rotas CRUD ---
router.get("/", clientCrud.getAll); // Listar todos com paginação/filtros
router.post(
  "/",
  clientValidationRules,
  clientValidationErrors,
  clientCrud.create
); // Criar novo
router.get("/:id", clientCrud.getById); // Buscar por ID
router.put(
  "/:id",
  clientValidationRules,
  clientValidationErrors,
  clientCrud.update
); // Atualizar
router.delete("/:id", clientCrud.remove); // Remover

module.exports = router;
