// routes/pageContentRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { slugify } = require("../utils/stringUtils");
const { 
    isSlugValid, 
    pageContentValidationRules, 
    pageContentValidationErrors 
} = require("../validators/pageContentValidador");
const { logActivity } = require("../utils/logger");


// --- Rota Pública (não requer autenticação) ---
// Deve vir ANTES da aplicação do middleware de autenticação.
// GET /api/pages/slug/politica-de-privacidade
router.get("/slug/:slug", async (req, res, next) => {
    try {
        const { slug } = req.params;
        const result = await pool.query("SELECT * FROM page_contents WHERE slug = $1", [slug]);

        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Página não encontrada." });
        }
        res.status(200).json({ status: "success", data: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// --- Rotas Administrativas (requerem autenticação e papel 'admin') ---
router.use(authenticateToken, authorizeRoles("admin"));

// Rota para CRIAR uma nova página
router.post(
    "/",
    pageContentValidationRules(),
    pageContentValidationErrors,
    async (req, res, next) => {
        try {
            const { title, content } = req.body;

            let slug = slugify(title);
            let i = 1;
            let newSlug = slug;
            while (true) {
                const checkSlug = await pool.query("SELECT * FROM page_contents WHERE slug = $1", [newSlug]);
                if (checkSlug.rowCount === 0) {
                    break; // Slug disponível
                }
                newSlug = `${slug}-${i}`;
                i++;
            }
            slug = newSlug; // Atualiza o slug para o novo valor único


            const sql = `INSERT INTO page_contents (title, slug, content) VALUES ($1, $2, $3) RETURNING *`;
            const result = await pool.query(sql, [title, slug, content]);

            // --- LOG DE AUDITORIA ---
            await logActivity(
                req.user.id, // ID do usuário logado, vindo do token JWT
                'CREATE_PAGE_CONTENT',
                { type: 'page_contents', id: result.rows[0].id },
                { requestBody: req.body } // Guardando o corpo da requisição como detalhe
            );
            // --- FIM DO LOG ---

            res.status(201).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para LER todas as páginas (para um painel de admin)
router.get("/", async (req, res, next) => {
    try {
        // Não enviamos o 'content' para não sobrecarregar a listagem
        const query = `SELECT id, title, slug, updated_at FROM page_contents ORDER BY title ASC`;
        const result = await pool.query(query);
        res.status(200).json({ status: "success", data: result.rows });
    } catch (error) {
        next(error);
    }
});

// Rota para LER uma página específica por ID (para edição no painel de admin)
router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM page_contents WHERE id = $1", [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Página não encontrada." });
        }
        res.status(200).json({ status: "success", data: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// Rota para ATUALIZAR uma página
router.put(
    "/:id",
    pageContentValidationRules(),
    pageContentValidationErrors,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { title, slug, content } = req.body;
            const sql = `UPDATE page_contents SET title = $1, slug = $2, content = $3, updated_at = NOW() WHERE id = $4 RETURNING *`;
            const result = await pool.query(sql, [title, slug, content, id]);
            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Página não encontrada." });
            }

            // --- LOG DE AUDITORIA ---
            await logActivity(
                req.user.id, // ID do usuário logado, vindo do token JWT
                'UPDATE_PAGE_CONTENT',
                { type: 'page_contents', id },
                { requestBody: req.body } // Guardando o corpo da requisição como detalhe
            );
            // --- FIM DO LOG ---

            res.status(200).json({ status: "success", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para DELETAR uma página
router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM page_contents WHERE id = $1", [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ status: "error", message: "Página não encontrada." });
        }

        // --- LOG DE AUDITORIA ---
        await logActivity(
            req.user.id, // ID do usuário logado, vindo do token JWT
            'DELETE_PAGE_CONTENT',
            { type: 'page_contents', id },
            { requestBody: req.body } // Guardando o corpo da requisição como detalhe
        );
        // --- FIM DO LOG ---
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

module.exports = router;