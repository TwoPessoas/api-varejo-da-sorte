// src/routes/gameOpportunityRoutes.js
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

// Validações Específicas de GameOpportunity
const {
  gameOpportunityValidationRules,
  gameOpportunityValidationErrors,
} = require("../validators/gameOpportunityValidador"); // Assumindo que este arquivo existe e está correto

// --- Configurações Específicas da Entidade GameOpportunity ---
const tableName = "game_opportunities";
const idField = "id"; // Campo da chave primária

// Campos que podem ser criados (camelCase)
// Baseado na rota POST original, apenas 'invoice_id' vem do corpo da requisição.
const creatableFields = ["invoiceId"];

// Campos que podem ser atualizados (camelCase)
// Baseado na rota PUT original: 'gift', 'active', 'used_at'
const updatableFields = ["gift", "active", "usedAt"];

// Campos que podem ser pesquisados/filtrados na listagem e exportação (camelCase)
const searchableFields = ["invoiceId", "gift", "active"];

// Definição das colunas para exportação (header, key, width para XLSX/PDF)
const gameOpportunityExportColumns = [
  { key: "id", header: "ID", width: 10 },
  { key: "invoice_id", header: "ID Fatura", width: 15 },
  { key: "gift", header: "Presente", width: 15 },
  { key: "active", header: "Ativo", width: 10 },
  { key: "used_at", header: "Usado Em", width: 25 },
  { key: "created_at", header: "Criado Em", width: 25 },
  { key: "updated_at", header: "Atualizado Em", width: 25 },
  // Campos vindos dos JOINs para contexto na exportação
  { key: "fiscal_code", header: "Cód. Fiscal Fatura", width: 25 },
  { key: "client_name", header: "Nome Cliente", width: 30 },
];

// --- Função getAll customizada para GameOpportunities (com JOINs para fiscal_code e client_name) ---
const getAllGameOpportunities = async (req, res, next) => {
  try {
    // Reutiliza buildQuery para lidar com whereClause, params e paginação/ordenação
    const { whereClause, params, currentPage, limit, offset, nextParamIndex } =
      buildQuery({
        tableName: tableName, // Nome da tabela principal para filtros do queryBuilder
        queryParams: req.query,
        searchableFields: searchableFields, // Campos pesquisáveis da tabela game_opportunities
        enableDateFiltering: true, // Habilita filtro por created_at se necessário
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
                go.*,
                i.fiscal_code,
                c.name as client_name
            FROM ${tableName} go
            LEFT JOIN invoices i ON go.invoice_id = i.id
            LEFT JOIN clients c ON i.client_id = c.id
            ${whereClause}
            ORDER BY ${orderByField} ${orderDirection}
            LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}`;

    // Adiciona limit e offset aos parâmetros da query
    params.push(limit, offset);
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

// --- Função getById customizada para GameOpportunities (com JOINs) ---
const getGameOpportunityById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = `
            SELECT
                go.*,
                i.fiscal_code,
                c.name as client_name
            FROM ${tableName} go
            LEFT JOIN invoices i ON go.invoice_id = i.id
            LEFT JOIN clients c ON i.client_id = c.id
            WHERE go.id = $1`;

    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Oportunidade de jogo não encontrada.",
      });
    }
    res
      .status(200)
      .json({
        status: "success",
        data: convertKeysToCamelCase(result.rows[0]),
      });
  } catch (error) {
    next(error);
  }
};

// --- Cria handlers CRUD para GameOpportunities (usando funções genéricas para create, update, delete) ---
const gameOpportunityCrud = createCrudHandlers({
  pool,
  tableName,
  idField,
  creatableFields,
  updatableFields,
  logActivity,
  defaultOrderBy: "createdAt", // Ordenação padrão para outras operações CRUD
  defaultOrderDirection: "DESC",
  // Não há lógica adicional específica (preCreate/preUpdate) para esta entidade
});

// --- Cria handler de Exportação para GameOpportunities ---
const exportGameOpportunitiesHandler = createExportHandler({
  pool,
  tableName,
  logActivity,
  columnsConfig: gameOpportunityExportColumns,
  searchableFields,
});

// --- Aplica middlewares de autenticação e autorização para TODAS as rotas de oportunidade de jogo ---
router.use(authenticateToken, authorizeRoles("admin"));

// Rota de Exportação genérica
router.get("/export", exportGameOpportunitiesHandler);

// --- Definição das Rotas ---
// Rota GET ALL customizada para incluir dados de JOIN
router.get("/", getAllGameOpportunities);

// Rota GET BY ID customizada para incluir dados de JOIN
router.get("/:id", getGameOpportunityById);
/*
// Rotas CREATE, UPDATE e DELETE usam os handlers genéricos
router.post(
  "/",
  gameOpportunityValidationRules, // Aplica as validações antes do handler genérico
  gameOpportunityValidationErrors,
  gameOpportunityCrud.create
);

router.put(
  "/:id",
  gameOpportunityValidationRules, // Aplica as validações antes do handler genérico
  gameOpportunityValidationErrors,
  gameOpportunityCrud.update
);*/

router.delete("/:id", gameOpportunityCrud.remove); // Usa 'remove' conforme definido em createCrudHandlers

module.exports = router;
