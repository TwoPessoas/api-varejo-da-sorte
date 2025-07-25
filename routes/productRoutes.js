// routes/productRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { productValidationRules, productValidationErrors } = require("../validators/productValidador");
const { logActivity } = require("../utils/logger");

// Protege todas as rotas de Produtos para serem acessíveis apenas por 'admin'
router.use(authenticateToken, authorizeRoles("admin"));

// Rota para CRIAR um novo produto (CREATE)
router.post(
    "/",
    productValidationRules(),
    productValidationErrors,
    async (req, res, next) => {
        try {
            const { ean, description, brand } = req.body;
            const sql = `INSERT INTO products (ean, description, brand) VALUES ($1, $2, $3) RETURNING *`;
            const result = await pool.query(sql, [ean, description, brand]);

            // --- LOG DE AUDITORIA ---
            await logActivity(
                req.user.id, // ID do usuário logado, vindo do token JWT
                'CREATE_PRODUCT',
                { type: 'products', id: result.rows[0].id },
                { requestBody: req.body } // Guardando o corpo da requisição como detalhe
            );
            // --- FIM DO LOG ---

            res.status(201).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * Rota para LER todos os produtos (READ ALL) com busca e paginação.
 * Ex: /api/products?page=1&limit=10&search=termo
 */
router.get("/", async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM products';
        let countQuery = 'SELECT COUNT(*) FROM products';
        const params = [];
        
        if (search) {
            const whereClause = ` WHERE description ILIKE $1 OR brand ILIKE $1`;
            query += whereClause;
            countQuery += whereClause;
            params.push(`%${search}%`);
        }
        
        query += ` ORDER BY description ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        const countResult = await pool.query(countQuery, search ? [`%${search}%`] : []);
        
        const totalProducts = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalProducts / limit);

        res.status(200).json({
            status: "success",
            data: result.rows,
            pagination: {
                totalProducts,
                totalPages,
                currentPage: page,
                limit
            }
        });
    } catch (error) {
        next(error);
    }
});

// Rota para LER um produto específico por ID (READ ONE)
router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Produto não encontrado." });
        }
        res.status(200).json({ status: "success", data: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// Rota para ATUALIZAR um produto (UPDATE)
router.put(
    "/:id",
    productValidationRules(),
    productValidationErrors,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { ean, description, brand } = req.body;
            const sql = `UPDATE products SET ean = $1, description = $2, brand = $3, updated_at = NOW() WHERE id = $4 RETURNING *`;
            const result = await pool.query(sql, [ean, description, brand, id]);
            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Produto não encontrado." });
            }

            // --- LOG DE AUDITORIA ---
            await logActivity(
                req.user.id, // ID do usuário logado, vindo do token JWT
                'UPDATE_PRODUCT',
                { type: 'products', id },
                { requestBody: req.body } // Guardando o corpo da requisição como detalhe
            );
            // --- FIM DO LOG ---

            res.status(200).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para DELETAR um produto (DELETE)
router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM products WHERE id = $1", [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Produto não encontrado." });
        }

        // --- LOG DE AUDITORIA ---
        await logActivity(
            req.user.id, // ID do usuário logado, vindo do token JWT
            'DELETE_PRODUCT',
            { type: 'products', id },
            { requestBody: req.body } // Guardando o corpo da requisição como detalhe
        );
        // --- FIM DO LOG ---

        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

module.exports = router;