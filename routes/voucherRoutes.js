// src/routes/voucherRoutes.js
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

// Validações Específicas de Voucher
const {
  voucherValidationRules,
  voucherValidationErrors,
} = require("../validators/voucherValidador"); // Assumindo que este arquivo existe e está correto
const { voucherMaskInfo } = require("../utils/maskInfo");
const { convertKeysToCamelCase } = require("../utils/objectUtils");

// --- Configurações Específicas da Entidade Voucher ---
const tableName = "vouchers";
const idField = "id"; // Campo da chave primária

// Campos que podem ser criados (camelCase)
const creatableFields = ["coupom", "drawDate", "voucherValue"];

// Campos que podem ser atualizados (camelCase)
const updatableFields = ["coupom", "drawDate", "voucherValue"];

// Campos que podem ser pesquisados/filtrados na listagem e exportação (camelCase)
const searchableFields = ["coupom", "drawDate"]; // Você pode adicionar 'voucherValue' se fizer sentido buscar por valor

// Definição das colunas para exportação (header, key, width para XLSX/PDF)
const voucherExportColumns = [
  { key: "id", header: "ID", width: 10 },
  { key: "coupom", header: "Cupom", width: 25 },
  { key: "draw_date", header: "Data do Sorteio", width: 25 },
  { key: "voucher_value", header: "Valor do Voucher", width: 20 },
  { key: "created_at", header: "Criado Em", width: 25 },
  { key: "updated_at", header: "Atualizado Em", width: 25 },
];

// --- Cria handlers CRUD para Vouchers ---
const voucherCrud = createCrudHandlers({
  pool,
  tableName,
  idField,
  creatableFields,
  updatableFields,
  logActivity, // A fábrica já integra a função de log
  // Configuração de ordenação padrão, conforme seu código original
  defaultOrderBy: "drawDate",
  defaultOrderDirection: "ASC",
  // Campos pesquisáveis para a função getAll genérica
  searchableFields: searchableFields,
  // Não há 'additionalLogic' específica para esta entidade com base no arquivo original
});

// --- Cria handler de Exportação para Vouchers ---
const exportVouchersHandler = createExportHandler({
  pool,
  tableName,
  logActivity,
  columnsConfig: voucherExportColumns,
  searchableFields,
});

const getVouchersDrawn = async (req, res, next) => {
  try {
    const {rows} = await pool.query(
      `SELECT v.draw_date, c.name, c.cpf 
       FROM ${tableName} as v
       join game_opportunities as go on v.game_opportunity_id = go.id
       join invoices as i on go.invoice_id = i.id 
       join clients as c on i.client_id = c.id 
       where v.game_opportunity_id is not null
       order by draw_date DESC`
    );

    const maskered = rows.map(el => voucherMaskInfo(el));
    
    res.status(200).json({ status: "success", data: maskered.map(convertKeysToCamelCase)});
  } catch (error) {
    next(error);
  }
}

// ------------ ROTAS PUBLICAS ------------
router.get("/drawn", getVouchersDrawn);

// --- Aplicação de Middlewares de Autenticação e Autorização para TODAS as rotas de voucher ---
router.use(authenticateToken, authorizeRoles("admin"));

// --- Definição das Rotas ---
// Rota para CRIAR um novo voucher
router.post(
  "/",
  voucherValidationRules(), // Aplica as validações antes do handler genérico
  voucherValidationErrors,
  voucherCrud.create
);

// Rota para LER todos os vouchers (com busca e paginação)
router.get("/", voucherCrud.getAll);

// Rota para LER um voucher específico por ID
router.get("/:id", voucherCrud.getById);

// Rota para ATUALIZAR um voucher
router.put(
  "/:id",
  voucherValidationRules(), // Aplica as validações antes do handler genérico
  voucherValidationErrors,
  voucherCrud.update
);

// Rota para DELETAR um voucher
router.delete("/:id", voucherCrud.remove); // Usa 'remove' conforme definido em createCrudHandlers

// Rota de Exportação (se aplicável)
router.get("/export", exportVouchersHandler);

module.exports = router;
