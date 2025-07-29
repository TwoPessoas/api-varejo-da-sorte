// src/routes/productRoutes.js
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

// Validações Específicas de Produto
const {
  productValidationRules,
  productValidationErrors,
} = require("../validators/productValidador"); // Assumindo que este arquivo existe e está correto

// --- Configurações Específicas da Entidade Produto ---
const tableName = "products";
const idField = "id"; // Campo da chave primária

// Campos que podem ser criados (camelCase)
const creatableFields = ["ean", "description", "brand"];

// Campos que podem ser atualizados (camelCase)
const updatableFields = ["ean", "description", "brand"];

// Campos que podem ser pesquisados/filtrados na listagem e exportação (camelCase)
// Corresponde à busca por 'description' ou 'brand' no getAll original
const searchableFields = ["description", "brand"];

// Definição das colunas para exportação (header, key, width para XLSX/PDF)
const productExportColumns = [
  { key: "id", header: "ID", width: 10 },
  { key: "ean", header: "EAN", width: 20 },
  { key: "description", header: "Descrição", width: 30 },
  { key: "brand", header: "Marca", width: 20 },
  { key: "created_at", header: "Criado Em", width: 25 },
  { key: "updated_at", header: "Atualizado Em", width: 25 },
];

// --- Cria handlers CRUD para Produtos ---
const productCrud = createCrudHandlers({
  pool,
  tableName,
  idField,
  creatableFields,
  updatableFields,
  logActivity,
  // Configuração de ordenação padrão: por descrição, ascendente
  defaultOrderBy: "description",
  defaultOrderDirection: "ASC",
  // Campos pesquisáveis para a função getAll genérica
  searchableFields: searchableFields,
  // Não há 'additionalLogic' específica necessária para produtos com base no arquivo original
});

// --- Cria handler de Exportação para Produtos ---
const exportProductsHandler = createExportHandler({
  pool,
  tableName,
  logActivity,
  columnsConfig: productExportColumns,
  searchableFields,
});

// --- Aplicação de Middlewares de Autenticação e Autorização para TODAS as rotas de produto ---
router.use(authenticateToken, authorizeRoles("admin"));

// --- Definição das Rotas ---
// Rota de Exportação (se aplicável)
router.get("/export", exportProductsHandler);

// Rota para CRIAR um novo produto
router.post(
  "/",
  productValidationRules(), // Aplica as validações antes do handler genérico
  productValidationErrors,
  productCrud.create
);

// Rota para LER todos os produtos (com busca e paginação)
router.get("/", productCrud.getAll);

// Rota para LER um produto específico por ID
router.get("/:id", productCrud.getById);

// Rota para ATUALIZAR um produto
router.put(
  "/:id",
  productValidationRules(), // Aplica as validações antes do handler genérico
  productValidationErrors,
  productCrud.update
);

// Rota para DELETAR um produto
router.delete("/:id", productCrud.remove); // Usa 'remove' conforme definido em createCrudHandlers

module.exports = router;
