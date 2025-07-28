// src/routes/drawNumberRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // Seu pool de conexão com o banco de dados

// Middlewares e Utils Genéricos
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");
const { logActivity } = require("../utils/logger");
const { createCrudHandlers } = require("../utils/crudHandlers"); // Importa a factory de CRUD
const { createExportHandler } = require("../utils/exportHandlers"); // Importa a factory de Exportação
const { toSnakeCase, convertKeysToCamelCase } = require("../utils/objectUtils"); // Para camelCase
const { buildQuery } = require("../utils/queryBuilder"); // Para reutilizar na custom getAll/getById

// Validações Específicas de DrawNumber
const {
  drawNumberValidationRules,
  drawNumberValidationErrors,
} = require("../validators/drawNumberValidador"); // Assumindo que este arquivo existe e está correto

// --- Configurações Específicas da Entidade DrawNumber ---
const tableName = "draw_numbers";
const idField = "id"; // Campo da chave primária

// Campos que podem ser criados (camelCase)
const creatableFields = ["invoiceId", "number"];

// Campos que podem ser atualizados (camelCase)
const updatableFields = ["number", "active", "winnerAt", "emailSendedAt"];

// Campos que podem ser pesquisados/filtrados na listagem e exportação (camelCase)
// Note: o `queryBuilder` atualmente busca em campos diretos da tabela.
// Para buscar em campos com JOIN (fiscalCode, clientName), seria necessário aprimorar
// o `buildQuery` ou adicionar lógica de filtragem customizada em `getAllDrawNumbers`.
const searchableFields = ["invoiceId", "number"];

// Definição das colunas para exportação (header, key, width para XLSX/PDF)
const drawNumberExportColumns = [
  { key: "id", header: "ID", width: 10 },
  { key: "invoice_id", header: "ID Fatura", width: 15 },
  { key: "number", header: "Número da Sorte", width: 20 },
  { key: "active", header: "Ativo", width: 10 },
  { key: "winner_at", header: "Data do Ganhador", width: 25 },
  { key: "email_sended_at", header: "Email Enviado Em", width: 25 },
  { key: "created_at", header: "Criado Em", width: 25 },
  { key: "updated_at", header: "Atualizado Em", width: 25 },
  // Campos vindos dos JOINs, para que apareçam na exportação
  { key: "fiscal_code", header: "Cód. Fiscal Fatura", width: 25 },
  { key: "client_name", header: "Nome Cliente", width: 30 },
];

// --- Função getAll customizada para DrawNumbers (com JOINs para fiscal_code e client_name) ---
const getAllDrawNumbers = async (req, res, next) => {
  try {
    // Reutiliza buildQuery para lidar com whereClause, params e paginação/ordenação
    const { whereClause, params, currentPage, limit, offset, nextParamIndex } =
      buildQuery({
        tableName: tableName, // Nome da tabela principal para filtros do queryBuilder
        queryParams: req.query,
        searchableFields: searchableFields, // Campos pesquisáveis da tabela draw_numbers
        enableDateFiltering: true, // Habilitar filtro por created_at se necessário
        orderBy: req.query.orderBy || "created_at", // Ordenação padrão
        orderDirection: req.query.orderDirection || "DESC",
      });

    // Query para contagem total de entidades (apenas na tabela principal)
    const countQuery = `SELECT COUNT(*) FROM ${tableName} ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const totalEntities = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalEntities / limit);

    // Query principal para buscar entidades com paginação, ordenação e JOINs
    const orderByField = toSnakeCase(req.query.orderBy || "created_at");
    const orderDirection = req.query.orderDirection || "DESC";

    let query = `
      SELECT 
        dn.*, 
        i.fiscal_code, 
        c.name as client_name
      FROM ${tableName} dn
      JOIN invoices i ON dn.invoice_id = i.id
      JOIN clients c ON i.client_id = c.id
      ${whereClause} 
      ORDER BY ${orderByField} ${orderDirection} 
      LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}`;

    params.push(limit, offset); // Adiciona limit e offset aos parâmetros da query
    const result = await pool.query(query, params);

    res.status(200).json({
      status: "success",
      data: result.rows.map(convertKeysToCamelCase), // Converte chaves para camelCase
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

// --- Função getById customizada para DrawNumbers (com JOINs) ---
const getDrawNumberById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        dn.*, 
        i.fiscal_code, 
        c.name as client_name
      FROM ${tableName} dn
      JOIN invoices i ON dn.invoice_id = i.id
      JOIN clients c ON i.client_id = c.id
      WHERE dn.id = $1`;

    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Número de sorteio não encontrado.",
      });
    }
    res
      .status(200)
      .json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

// --- Cria handlers CRUD para DrawNumbers (usando funções genéricas para create, update, delete) ---
const drawNumberCrud = createCrudHandlers({
  pool,
  tableName,
  idField,
  creatableFields,
  updatableFields,
  logActivity,
  defaultOrderBy: "createdAt", // Ordenação padrão para outras operações CRUD
  defaultOrderDirection: "DESC",
});

// --- Cria handler de Exportação para DrawNumbers ---
const exportDrawNumbersHandler = createExportHandler({
  pool,
  tableName,
  logActivity,
  columnsConfig: drawNumberExportColumns,
  searchableFields,
});

// --- Aplica middlewares de autenticação e autorização para TODAS as rotas de draw number ---
router.use(authenticateToken, authorizeRoles("admin"));

// Rota de Exportação genérica
router.get("/export", exportDrawNumbersHandler);

// --- Definição das Rotas ---
// Rota GET ALL customizada para incluir dados de JOIN
router.get("/", getAllDrawNumbers);

// Rota GET BY ID customizada para incluir dados de JOIN
router.get("/:id", getDrawNumberById);

// Rotas CREATE, UPDATE e DELETE usam os handlers genéricos
/*router.post(
  "/",
  drawNumberValidationRules, // Aplica as validações antes do handler genérico
  drawNumberValidationErrors,
  drawNumberCrud.create
);*/

/*router.put(
  "/:id",
  drawNumberValidationRules, // Aplica as validações antes do handler genérico
  drawNumberValidationErrors,
  drawNumberCrud.update
);*/

router.delete("/:id", drawNumberCrud.remove); // Usa 'remove' conforme definido em createCrudHandlers

module.exports = router;
