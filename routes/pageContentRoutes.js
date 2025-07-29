// src/routes/pageContentRoutes.js
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
const { buildQuery } = require("../utils/queryBuilder"); // Para reutilizar na custom getAll
const { slugify } = require("../utils/stringUtils"); // Para gerar slugs

// Validações Específicas de PageContent
const {
  pageContentValidationRules,
  pageContentValidationErrors,
} = require("../validators/pageContentValidador"); // Assumindo que este arquivo existe e está correto

// --- Configurações Específicas da Entidade PageContent ---
const tableName = "page_contents";
const idField = "id"; // Campo da chave primária

// Campos que podem ser criados (camelCase)
// O slug será gerado automaticamente no preCreate hook
const creatableFields = ["title", "content", "slug"];

// Campos que podem ser atualizados (camelCase)
const updatableFields = ["title", "content", "slug"];

// Campos que podem ser pesquisados/filtrados na listagem e exportação (camelCase)
const searchableFields = ["title", "slug"];

// Definição das colunas para exportação
const pageContentExportColumns = [
  { key: "id", header: "ID", width: 10 },
  { key: "title", header: "Título", width: 30 },
  { key: "slug", header: "Slug", width: 30 },
  { key: "content", header: "Conteúdo", width: 50 }, // Inclui conteúdo na exportação
  { key: "created_at", header: "Criado Em", width: 25 },
  { key: "updated_at", header: "Atualizado Em", width: 25 },
];

// --- Rota Pública (não requer autenticação) ---
// Deve vir ANTES da aplicação do middleware de autenticação (router.use(authenticateToken, authorizeRoles("admin"))).
// GET /api/pages/slug/politica-de-privacidade
router.get("/slug/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await pool.query(
      "SELECT * FROM page_contents WHERE slug = $1",
      [slug]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Página não encontrada." });
    }
    res.status(200).json({
      status: "success",
      data: convertKeysToCamelCase(result.rows[0]),
    });
  } catch (error) {
    next(error);
  }
});

// --- Funções Auxiliares para lógica customizada (especialmente preCreate) ---

/**
 * Lógica customizada para gerar e garantir a unicidade do slug antes de criar/atualizar uma página.
 * @param {object} data - Os dados da requisição (req.body)
 * @param {object} context - Contexto adicional, incluindo o pool de conexão.
 * @returns {object} Os dados processados com o slug único.
 * @throws {Error} Se ocorrer um erro na geração do slug.
 */
const generateUniqueSlug = async (data, context) => {
  const { pool } = context; // Obtém o pool de conexão do contexto

  let baseSlug = slugify(data.title);
  let newSlug = baseSlug;
  let i = 1;

  // Loop para garantir a unicidade do slug
  while (true) {
    // Verifica se o slug já existe no banco de dados
    const checkSlug = await pool.query(
      "SELECT id FROM page_contents WHERE slug = $1",
      [newSlug]
    );
    if (checkSlug.rowCount === 0) {
      break; // Slug disponível, sai do loop
    }
    // Se o slug já existe, adiciona um contador e tenta novamente
    newSlug = `${baseSlug}-${i}`;
    i++;
  }

  // Atualiza o slug nos dados para inserção
  return { ...data, slug: newSlug };
};

// --- Funções CRUD customizadas para PageContent ---

// Custom GET ALL para listar páginas no painel de administração (exclui o campo 'content' por performance)
const getAllPageContentsForAdminList = async (req, res, next) => {
  try {
    const { whereClause, params, currentPage, limit, offset, nextParamIndex } =
      buildQuery({
        tableName: tableName,
        queryParams: req.query,
        searchableFields: searchableFields,
        enableDateFiltering: true,
        orderBy: req.query.orderBy || "title", // Padrão 'title' para listagem admin
        orderDirection: req.query.orderDirection || "ASC",
      });

    const countQuery = `SELECT COUNT(*) FROM ${tableName} ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const totalEntities = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalEntities / limit);

    // Seleciona explicitamente apenas os campos necessários para a listagem
    const query = `
      SELECT id, title, slug, updated_at 
      FROM ${tableName} ${whereClause} 
      ORDER BY ${toSnakeCase(req.query.orderBy || "title")} ${
      req.query.orderDirection || "ASC"
    } 
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

// --- Rotas Administrativas (requerem autenticação e papel 'admin') ---
router.use(authenticateToken, authorizeRoles("admin"));

// --- Cria handlers CRUD para PageContent (usando funções genéricas e customizadas) ---
const pageContentCrud = createCrudHandlers({
  pool,
  tableName,
  idField,
  creatableFields,
  updatableFields,
  logActivity,
  defaultOrderBy: "title", // Ordenação padrão para outras operações CRUD
  defaultOrderDirection: "ASC",
  additionalLogic: {
    // Sobrescreve o hook preCreate para gerar e garantir a unicidade do slug
    preCreate: async (data) => generateUniqueSlug(data, { pool }),
    // Para updates, precisamos garantir que o slug é único, mas permitindo o slug atual
    // Se o slug foi alterado na requisição, ele precisa ser validado.
    // Se o slug não foi alterado, ou se o título foi alterado e o slug também,
    // a lógica abaixo garante que o novo slug é único (exceto para o ID da própria entidade).
    preUpdate: async (data) => {
      // Se o slug é enviado no corpo da requisição e é diferente do original
      // ou se o título mudou e não há slug customizado, regerar/validar o slug.
      // A complexidade de "saber o slug original" é maior aqui.
      // Por simplicidade, a validação de unicidade do slug é delegada ao `pageContentValidationRules`
      // que deve verificar se o slug é único EXCETO para o ID que está sendo atualizado.
      // No entanto, se o título mudar e o slug NÃO for fornecido, podemos regerar um.
      if (data.title && !data.slug) {
        // Se o título mudou mas o slug não foi fornecido, regerar um slug baseado no novo título.
        // Isso pode ser uma convenção de negócio.
        return generateUniqueSlug(data, { pool });
      }
      return data; // Retorna os dados como estão, confiando nas validações ou que o slug já é único
    },
  },
});

// --- Cria handler de Exportação para PageContent ---
const exportPageContentsHandler = createExportHandler({
  pool,
  tableName,
  logActivity,
  columnsConfig: pageContentExportColumns,
  searchableFields,
});

// --- Definição das Rotas Administrativas ---

// Rota de Exportação (opcional, mas boa para consistência)
router.get("/export", exportPageContentsHandler);

// Rota para CRIAR uma nova página
router.post(
  "/",
  pageContentValidationRules(), // Validações (incluindo unicidade de slug e formato)
  pageContentValidationErrors,
  pageContentCrud.create // Usa o handler genérico com preCreate customizado
);

// Rota para LER todas as páginas (para um painel de admin - customizada para não trazer 'content')
router.get("/", getAllPageContentsForAdminList);

// Rota para LER uma página específica por ID (para edição no painel de admin)
router.get("/:id", pageContentCrud.getById);

// Rota para ATUALIZAR uma página
router.put(
  "/:id",
  pageContentValidationRules(), // Validações (incluindo unicidade de slug e formato)
  pageContentValidationErrors,
  pageContentCrud.update
);

// Rota para DELETAR uma página
router.delete("/:id", pageContentCrud.remove);

module.exports = router;
