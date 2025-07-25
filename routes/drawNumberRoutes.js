// routes/drawNumberRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { 
    drawNumberValidationRules, 
    drawNumberValidationErrors 
} = require("../validators/drawNumberValidador");
const { logActivity } = require("../utils/logger");


// Protege todas as rotas para serem acessíveis apenas por 'admin'
router.use(authenticateToken, authorizeRoles("admin"));

// Rota para CRIAR um novo número de sorteio (CREATE)
router.post(
    "/",
    drawNumberValidationRules,
    drawNumberValidationErrors,
    async (req, res, next) => {
        try {
            const { invoice_id, number } = req.body;

            const sql = `
                INSERT INTO draw_numbers (invoice_id, number)
                VALUES ($1, $2)
                RETURNING *`;
            
            const params = [invoice_id, number];
            const result = await pool.query(sql, params);

            // --- LOG DE AUDITORIA ---
            await logActivity(
                req.user.id, // ID do usuário logado, vindo do token JWT
                'CREATE_DRAW_NUMBER',
                { type: 'draw_numbers', id: result.rows[0].id },
                { requestBody: req.body } // Guardando o corpo da requisição como detalhe
            );
            // --- FIM DO LOG ---

            res.status(201).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para LER todos os números de sorteio (READ ALL)
router.get("/", async (req, res, next) => {
    try {
        // Query com JOIN para trazer informações contextuais da nota fiscal e do cliente
        const query = `
            SELECT 
                dn.*, 
                i.fiscal_code, 
                c.name as client_name
            FROM 
                draw_numbers dn
            JOIN 
                invoices i ON dn.invoice_id = i.id
            JOIN 
                clients c ON i.client_id = c.id
            ORDER BY 
                dn.created_at DESC`;
        
        const result = await pool.query(query);
        res.status(200).json({ status: "success", data: result.rows });
    } catch (error) {
        next(error);
    }
});

// Rota para LER um número específico por ID (READ ONE)
router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                dn.*, 
                i.fiscal_code, 
                c.name as client_name
            FROM 
                draw_numbers dn
            JOIN 
                invoices i ON dn.invoice_id = i.id
            JOIN 
                clients c ON i.client_id = c.id
            WHERE
                dn.id = $1`;

        const result = await pool.query(query, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Número de sorteio não encontrado." });
        }
        res.status(200).json({ status: "success", data: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// Rota para ATUALIZAR um número de sorteio (UPDATE)
router.put(
    "/:id",
    drawNumberValidationRules,
    drawNumberValidationErrors,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { number, active, winner_at, email_sended_at } = req.body;
            
            let sql = "UPDATE draw_numbers SET updated_at = NOW(), number = $1";
            const params = [number];

            if (active !== undefined){
                params.push(active);
                sql += ", active = $" + (params.length);
            }

            if (winner_at !== undefined) {
                params.push(winner_at); 
                sql += ", winner_at = $" + (params.length);
            }

            if (email_sended_at !== undefined) {
                params.push(email_sended_at);
                sql += ", email_sended_at = $" + (params.length);
            }

            params.push(id);
            sql += " WHERE id = $" + (params.length) + " RETURNING *";
            
            const result = await pool.query(sql, params);

            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Número de sorteio não encontrado." });
            }

            // --- LOG DE AUDITORIA ---
            await logActivity(
                req.user.id, // ID do usuário logado, vindo do token JWT
                'UPDATE_DRAW_NUMBER',
                { type: 'draw_numbers', id },
                { requestBody: req.body } // Guardando o corpo da requisição como detalhe
            );
            // --- FIM DO LOG ---

            res.status(200).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para DELETAR um número de sorteio (DELETE)
router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM draw_numbers WHERE id = $1", [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Número de sorteio não encontrado." });
        }

        // --- LOG DE AUDITORIA ---
        await logActivity(
            req.user.id, // ID do usuário logado, vindo do token JWT
            'DELETE_DRAW_NUMBER',
            { type: 'draw_numbers', id },
            { requestBody: req.body } // Guardando o corpo da requisição como detalhe
        );
        // --- FIM DO LOG ---
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

module.exports = router;