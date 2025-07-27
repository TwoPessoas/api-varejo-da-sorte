// routes/drawNumberRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");
const {
  drawNumberValidationRules,
  drawNumberValidationErrors,
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
        "CREATE_DRAW_NUMBER",
        { type: "draw_numbers", id: result.rows[0].id },
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = JSON.parse(req.query.search) || {};
    const offset = (page - 1) * limit;

    let query =
      "SELECT dn.*, i.fiscal_code, c.name as client_name FROM draw_numbers dn JOIN invoices i ON dn.invoice_id = i.id JOIN clients c ON i.client_id = c.id";
    let countQuery = "SELECT COUNT(*) FROM draw_numbers";
    let where = " WHERE 1=1 ";
    const params = [];
    Object.keys(search).forEach((key) => {
      if (
        search[key] !== undefined &&
        search[key] !== null &&
        search[key] !== ""
      ) {
        const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        const condition = `${snakeKey} ILIKE $${params.length + 1}`;
        where += ` AND ${condition}`;
        params.push(`%${search[key]}%`);
      }
    });

    countQuery += where;
    const countResult = await pool.query(countQuery, params);

    query += where;
    query += ` ORDER BY dn.created_at DESC LIMIT $${
      params.length + 1
    } OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);

    const totalProducts = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json({
      status: "success",
      data: result.rows,
      pagination: {
        totalProducts,
        totalPages,
        currentPage: page,
        limit,
      },
    });
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
      return res
        .status(404)
        .json({
          status: "error",
          message: "Número de sorteio não encontrado.",
        });
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

      if (active !== undefined) {
        params.push(active);
        sql += ", active = $" + params.length;
      }

      if (winner_at !== undefined) {
        params.push(winner_at);
        sql += ", winner_at = $" + params.length;
      }

      if (email_sended_at !== undefined) {
        params.push(email_sended_at);
        sql += ", email_sended_at = $" + params.length;
      }

      params.push(id);
      sql += " WHERE id = $" + params.length + " RETURNING *";

      const result = await pool.query(sql, params);

      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({
            status: "error",
            message: "Número de sorteio não encontrado.",
          });
      }

      // --- LOG DE AUDITORIA ---
      await logActivity(
        req.user.id, // ID do usuário logado, vindo do token JWT
        "UPDATE_DRAW_NUMBER",
        { type: "draw_numbers", id },
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
    const result = await pool.query("DELETE FROM draw_numbers WHERE id = $1", [
      id,
    ]);

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({
          status: "error",
          message: "Número de sorteio não encontrado.",
        });
    }

    // --- LOG DE AUDITORIA ---
    await logActivity(
      req.user.id, // ID do usuário logado, vindo do token JWT
      "DELETE_DRAW_NUMBER",
      { type: "draw_numbers", id },
      { requestBody: req.body } // Guardando o corpo da requisição como detalhe
    );
    // --- FIM DO LOG ---
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
