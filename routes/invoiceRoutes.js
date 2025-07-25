// routes/invoiceRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
    authenticateToken,
    authorizeRoles,
} = require("../middleware/authMiddleware");
const {
    invoiceValidationRules,
    invoiceValidationErrors 
} = require("../validators/invoiceValidador");


// Proteger todas as rotas de invoice para serem acessíveis apenas por 'admin'
router.use(authenticateToken, authorizeRoles("admin"));

// Rota para CRIAR uma nova invoice (CREATE)
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin"),
    invoiceValidationRules,
    invoiceValidationErrors,
    async (req, res, next) => {
        try {
            /*const { fiscal_code, invoce_value, has_item, has_creditcard, has_partner_code, pdv, store, num_coupon, cnpj, creditcard, client_id } = req.body;

            const sql = `
                INSERT INTO invoices (fiscal_code, invoce_value, has_item, has_creditcard, has_partner_code, pdv, store, num_coupon, cnpj, creditcard, client_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`;
            
            const params = [fiscal_code, invoce_value, has_item, has_creditcard, has_partner_code, pdv, store, num_coupon, cnpj, creditcard, client_id];
            */
           let invoce_value = 10;

            const { fiscal_code, client_id } = req.body;

            const sql = `
                INSERT INTO invoices (fiscal_code, client_id, invoce_value)
                VALUES ($1, $2, $3)
                RETURNING *`;
            
            const params = [fiscal_code, client_id, invoce_value];            
            
            const result = await pool.query(sql, params);

            res.status(201).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para LER todas as invoices (READ ALL)
router.get(
    "/",
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res, next) => {
        try {
            // Query para buscar invoices e também alguns dados do cliente associado
            const query = `
                SELECT i.*, c.name as client_name 
                FROM invoices i
                JOIN clients c ON i.client_id = c.id
                ORDER BY i.created_at DESC`;
            
            const result = await pool.query(query);
            res.status(200).json({ status: "success", data: result.rows });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para LER uma invoice específica por ID (READ ONE)
router.get(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const result = await pool.query("SELECT * FROM invoices WHERE id = $1", [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ status: "error", message: "Invoice não encontrada." });
            }
            res.status(200).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para ATUALIZAR uma invoice (UPDATE)
router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    invoiceValidationRules,
    invoiceValidationErrors,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            /*const { fiscal_code, invoce_value, has_item, has_creditcard, has_partner_code, pdv, store, num_coupon, cnpj, creditcard, client_id } = req.body;
            
            const sql = `
                UPDATE invoices SET 
                    fiscal_code = $1, invoce_value = $2, has_item = $3, has_creditcard = $4, has_partner_code = $5, pdv = $6, store = $7, num_coupon = $8, cnpj = $9, creditcard = $10, client_id = $11, "updatedAt" = NOW()
                WHERE id = $12
                RETURNING *`;
            
            const params = [fiscal_code, invoce_value, has_item, has_creditcard, has_partner_code, pdv, store, num_coupon, cnpj, creditcard, client_id, id];
            */
            const { fiscal_code } = req.body;
            
            const sql = `
                UPDATE invoices SET 
                    fiscal_code = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING *`;
            
            const params = [fiscal_code, id];


            const result = await pool.query(sql, params);

            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Invoice não encontrada." });
            }

            res.status(200).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para DELETAR uma invoice (DELETE)
router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const result = await pool.query("DELETE FROM invoices WHERE id = $1", [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Invoice não encontrada." });
            }
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;