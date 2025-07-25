const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { 
    voucherValidationRules, 
    voucherValidationErrors 
} = require("../validators/voucherValidador");
const { logActivity } = require("../utils/logger");

// Protege todas as rotas para serem acessíveis apenas por 'admin'
router.use(authenticateToken, authorizeRoles("admin"));

// Rota para CRIAR um novo voucher (CREATE)
router.post(
    "/",
    voucherValidationRules(),
    voucherValidationErrors,
    async (req, res, next) => {
        try {
            const { coupom, draw_date, voucher_value } = req.body;
            const sql = `
                INSERT INTO vouchers (coupom, draw_date, voucher_value) 
                VALUES ($1, $2, $3) RETURNING *`;
            const result = await pool.query(sql, [coupom, draw_date, voucher_value]);

            // --- LOG DE AUDITORIA ---
            await logActivity(
                req.user.id, // ID do usuário logado, vindo do token JWT
                'CREATE_VOUCHER',
                { type: 'vouchers', id: result.rows[0].id },
                { requestBody: req.body } // Guardando o corpo da requisição como detalhe
            );
            // --- FIM DO LOG ---

            res.status(201).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para LER todos os vouchers (READ ALL) com JOIN para mais contexto
router.get("/", async (req, res, next) => {
    try {
        const query = `
            SELECT 
                v.* 
            FROM 
                vouchers v
            ORDER BY 
                v.draw_date ASC`;
        
        const result = await pool.query(query);
        res.status(200).json({ status: "success", data: result.rows });
    } catch (error) {
        next(error);
    }
});

// Rota para LER um voucher específico por ID (READ ONE)
router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM vouchers WHERE id = $1", [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Voucher não encontrado." });
        }
        res.status(200).json({ status: "success", data: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// Rota para ATUALIZAR um voucher (UPDATE)
router.put(
    "/:id",
    voucherValidationRules(),
    voucherValidationErrors,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { coupom, draw_date, voucher_value } = req.body;
            const sql = `
                UPDATE vouchers SET 
                    coupom = $1, draw_date = $2, voucher_value = $3, updated_at = NOW() 
                WHERE id = $4 RETURNING *`;
            const result = await pool.query(sql, [coupom, draw_date, voucher_value, id]);
            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Voucher não encontrado." });
            }

            // --- LOG DE AUDITORIA ---
            await logActivity(
                req.user.id, // ID do usuário logado, vindo do token JWT
                'UPDATE_VOUCHER',
                { type: 'vouchers', id },
                { requestBody: req.body } // Guardando o corpo da requisição como detalhe
            );
            // --- FIM DO LOG ---

            res.status(200).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para DELETAR um voucher (DELETE)
router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM vouchers WHERE id = $1", [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Voucher não encontrado." });
        }

        // --- LOG DE AUDITORIA ---
        await logActivity(
            req.user.id, // ID do usuário logado, vindo do token JWT
            'UPDATE_VOUCHER',
            { type: 'vouchers', id },
            { requestBody: req.body } // Guardando o corpo da requisição como detalhe
        );
        // --- FIM DO LOG ---

        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

module.exports = router;