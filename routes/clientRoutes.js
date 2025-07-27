const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // Importa o pool de conexões
const crypto = require("crypto");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");
const {
  clientValidationRules,
  clientValidationErrors,
} = require("../validators/clienteValidador");
const { logActivity } = require("../utils/logger");

// Protege todas as rotas para serem acessíveis apenas por 'admin'
router.use(authenticateToken, authorizeRoles("admin"));
const { convertKeysToCamelCase } = require("../utils/objectUtils");
const { isArray, isObject } = require("util");

/*const { clientMaskInfo } = require("../utils/maskInfo");

// Rotas Públicas (não requerem autenticação)
// Esta rota deve vir ANTES das rotas com /:id para evitar conflitos de matching
router.get(
    "/findByCpf/:cpf",
    findByCpfRules, // Valida o formato do CPF na URL
    clientValidationErrors,// Trata os erros de validação
    async (req, res, next) => {
        try {
            const cpfParam = req.params.cpf;

            // 1. Tenta encontrar o cliente pelo CPF
            const [rows] = await pool.query('SELECT * FROM clients WHERE cpf = $1', [cpfParam]);
            
            let cliente;

            if (rows.length > 0) {
                // 2a. Se encontrou, usa o cliente existente
                cliente = rows[0];
            } else {
                // 2b. Se NÃO encontrou, cria um novo cliente (pré-registro)
                const sqlInsert = 'INSERT INTO clients (cpf, isPreRegister) VALUES ($1, $2) RETURNING *';
                const result = await pool.query(sqlInsert, [cpfParam, true]);

                cliente = result.rows[0];
            }
            
            // 4. Mascara os dados antes de enviar a resposta
            const dadosMascarados = mascararDadosCliente(cliente);

            // 5. Retorna uma resposta 200 OK com os dados mascarados
            res.status(200).json({
                status: "success",
                data: dadosMascarados,
            });

        } catch (error) {
            next(error);
        }
    }
);*/

// Rota para CRIAR um novo client (CREATE)
// Apenas 'admin' pode criar.
router.post(
  "/",
  clientValidationRules, // Aplica as regras de validação
  clientValidationErrors, // Trata os erros de validação
  async (req, res, next) => {
    try {
      const { isPreRegister, name, cpf, birthday, cel, email } = req.body;

      // 2. GERAR O TOKEN SEGURO
      // crypto.randomBytes(32) gera 32 bytes de dados aleatórios.
      // .toString('hex') converte esses bytes para uma string hexadecimal de 64 caracteres.
      const newToken = crypto.randomBytes(32).toString("hex");

      // 3. SQL
      // Incluímos as colunas `token`, `createdAt` e `updatedAt`.
      // Usamos a função NOW() do PostgreSQL para garantir o timestamp do banco de dados,
      // que é a prática mais robusta.
      const sql = `INSERT INTO clients 
                            (is_pre_register, name, cpf, birthday, cel, email, token)
                         VALUES 
                            ($1, $2, $3, $4, $5, $6, $7) 
                         RETURNING *`;

      // 4. ADICIONAR O TOKEN GERADO AOS PARÂMETROS
      const params = [isPreRegister, name, cpf, birthday, cel, email, newToken];

      const result = await pool.query(sql, params);

      // --- LOG DE AUDITORIA ---
      await logActivity(
        req.user.id, // ID do usuário logado, vindo do token JWT
        "CREATE_CLIENT",
        { type: "clients", id: result.rows[0].id },
        { requestBody: req.body } // Guardando o corpo da requisição como detalhe
      );
      // --- FIM DO LOG ---

      const clientFromDb = result.rows[0];
      const clientForFrontend = convertKeysToCamelCase(clientFromDb);

      res.status(201).json({
        status: "success",
        message: "Cliente criado com sucesso.",
        data: clientForFrontend,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Rota para LER todos os clients (READ ALL)
// Apenas 'admin' pode ler.
router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = JSON.parse(req.query.search) || {};
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM clients";
    let countQuery = "SELECT COUNT(*) FROM clients";
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
    query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
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

// Rota para LER um client específico por ID (READ ONE)
// Apenas 'admin' podem ler.
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM clients WHERE id = $1", [
      id,
    ]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Cliente não encontrado." });
    }
    const clientFromDb = rows[0];
    const clientForFrontend = convertKeysToCamelCase(clientFromDb);
    res.status(200).json(clientForFrontend);
  } catch (error) {
    next(error);
  }
});

// Rota para ATUALIZAR um client (UPDATE)
// Apenas 'admin' pode atualizar.
router.put(
  "/:id",
  clientValidationRules,
  clientValidationErrors,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, cpf, birthday, cel, email } = req.body;

      // MUDANÇA: A cláusula `updatedAt` é definida explicitamente
      const sql = `UPDATE clients SET 
                            is_pre_register = $1, name = $2, cpf = $3, birthday = $4, 
                            cel = $5, email = $6, updated_at = NOW()
                         WHERE id = $7
                         RETURNING *`;
      const params = [false, name, cpf, birthday, cel, email, id];

      const result = await pool.query(sql, params);
      // MUDANÇA: de affectedRows para rowCount
      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ status: "error", message: "Cliente não encontrado." });
      }

      // --- LOG DE AUDITORIA ---
      await logActivity(
        req.user.id, // ID do usuário logado, vindo do token JWT
        "UPDATE_CLIENT",
        { type: "clients", id },
        { requestBody: req.body } // Guardando o corpo da requisição como detalhe
      );
      // --- FIM DO LOG ---

      const clientFromDb = result.rows[0];
      const clientForFrontend = convertKeysToCamelCase(clientFromDb);
      res
        .status(200)
        .json({
          status: "success",
          message: "Cliente atualizado com sucesso.",
          data: clientForFrontend,
        });
    } catch (error) {
      next(error);
    }
  }
);

// Rota para DELETAR um client (DELETE)
// Apenas 'admin' pode deletar.
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM clients WHERE id = $1", [id]);
    // MUDANÇA: de affectedRows para rowCount
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Cliente não encontrado." });
    }

    // --- LOG DE AUDITORIA ---
    await logActivity(
      req.user.id, // ID do usuário logado, vindo do token JWT
      "DELETE_CLIENT",
      { type: "clients", id },
      { requestBody: req.body } // Guardando o corpo da requisição como detalhe
    );
    // --- FIM DO LOG ---

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
