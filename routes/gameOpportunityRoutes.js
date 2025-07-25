// routes/gameOpportunityRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
    gameOpportunityValidationRules,
    gameOpportunityValidationErrors 
} = require("../validators/gameOpportunityValidador");


// Protege todas as rotas de GameOpportunity para serem acessíveis apenas por 'admin'
router.use(authenticateToken, authorizeRoles("admin"));

// Rota para CRIAR uma nova oportunidade (CREATE)
router.post(
    "/",
    gameOpportunityValidationRules,
    gameOpportunityValidationErrors,
    async (req, res, next) => {
        try {
            const { invoice_id } = req.body;

            const sql = `
                INSERT INTO game_opportunities (invoice_id)
                VALUES ($1)
                RETURNING *`;
            
            const params = [invoice_id];
            const result = await pool.query(sql, params);

            res.status(201).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para LER todas as oportunidades (READ ALL)
router.get("/", async (req, res, next) => {
    try {
        // Query para buscar oportunidades com dados do cliente e da nota fiscal
        const query = `
            SELECT 
                go.*, 
                c.name as client_name,
                i.fiscal_code
            FROM 
                game_opportunities go
            LEFT JOIN 
                invoices i ON go.invoice_id = i.id
            LEFT JOIN 
                clients c ON i.client_id = c.id
            ORDER BY 
                go.created_at DESC`;
        
        const result = await pool.query(query);
        res.status(200).json({ status: "success", data: result.rows });
    } catch (error) {
        next(error);
    }
});

// Rota para LER uma oportunidade específica por ID (READ ONE)
router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                go.*, 
                c.name as client_name,
                i.fiscal_code
            FROM 
                game_opportunities go
            LEFT JOIN 
                invoices i ON go.invoice_id = i.id
            LEFT JOIN 
                clients c ON i.client_id = c.id
            WHERE
                go.id = $1`;

        const result = await pool.query(query, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Oportunidade de jogo não encontrada." });
        }
        res.status(200).json({ status: "success", data: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// Rota para ATUALIZAR uma oportunidade (UPDATE)
router.put(
    "/:id",
    gameOpportunityValidationRules,
    gameOpportunityValidationErrors,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { gift, active, used_at } = req.body;
            
            let sql = "UPDATE game_opportunities SET updated_at = NOW()";
            const params = [];

            if (gift !== undefined){
                params.push(gift);
                sql += ", gift = $" + (params.length);

            }

            if (active !== undefined){
                params.push(active);
                 sql += ", active = $" + (params.length);
            }

            if (used_at !== undefined){
                params.push(used_at);
                sql += ", used_at = $" + (params.length);
            };

            params.push(id);
            sql += " WHERE id = $" + (params.length) +"  RETURNING *";

            const result = await pool.query(sql, params);

            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Oportunidade de jogo não encontrada." });
            }

            res.status(200).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para DELETAR uma oportunidade (DELETE)
router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM game_opportunities WHERE id = $1", [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Oportunidade de jogo não encontrada." });
        }
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

module.exports = router;