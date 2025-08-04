// routes/authRoutes.js

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const {
  authValidationRules,
  authValidationErrors,
  loginValidationRules,
  webLoginValidationRules,
} = require("../validators/authValidador");

/**
 * @route   POST /api/auth/register
 * @desc    Registra um novo usuário
 * @access  Public
 */
router.post(
  "/register",
  authValidationRules, // Aplica as regras de validação
  authValidationErrors, // Trata os erros de validação
  async (req, res, next) => {
    // Para garantir a consistência dos dados, usaremos uma transação
    const repository = await pool.connect();

    try {
      await repository.query("BEGIN"); // Inicia a transação

      const { username, password, email } = req.body;

      // 2. Verificar se o usuário já existe
      const userExists = await repository.query(
        "SELECT id FROM users WHERE email = $1 OR username = $2",
        [email, username]
      );

      if (userExists.rows.length > 0) {
        return res.status(409).json({
          status: "error",
          message: "Email ou nome de usuário já existente.",
        });
      }

      // 3. Hash da senha
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10");
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // 4. Inserir o novo usuário na tabela 'users'
      const newUserQuery = `
                INSERT INTO users (username, email, password) 
                VALUES ($1, $2, $3) 
                RETURNING id`;
      const newUserResult = await repository.query(newUserQuery, [
        username,
        email,
        hashedPassword,
      ]);
      const newUserId = newUserResult.rows[0].id;

      // 5. Obter o ID do papel 'user'
      const roleResult = await repository.query(
        "SELECT id FROM roles WHERE name = 'user'"
      );
      if (roleResult.rows.length === 0) {
        // Isso seria um erro de configuração do sistema
        throw new Error("O papel 'user' não foi encontrado no banco de dados.");
      }
      const userRoleId = roleResult.rows[0].id;

      // 6. Vincular o novo usuário ao papel 'user' na tabela 'usuario_roles'
      const userRoleQuery = `
                INSERT INTO user_roles (user_id, role_id) 
                VALUES ($1, $2)`;
      await repository.query(userRoleQuery, [newUserId, userRoleId]);

      // 7. Se tudo correu bem, confirma a transação
      await repository.query("COMMIT");

      res.status(201).json({
        status: "success",
        message: "Usuário registrado com sucesso. Por favor, faça o login.",
        data: {
          id: newUserId,
          username: username,
        },
      });
    } catch (error) {
      // 8. Se algo deu errado, desfaz todas as operações da transação
      await repository.query("ROLLBACK");
      next(error); // Passa o erro para o handler central
    } finally {
      // 9. Libera o cliente de volta para o pool, independentemente do resultado
      repository.release();
    }
  }
);

/**
 * @route   POST /api/auth/login
 * @desc    Autentica o usuário e retorna um JWT
 * @access  Public
 */
router.post(
  "/login",
  loginValidationRules,
  authValidationErrors,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // Query complexa para buscar o usuário e agregar seus papéis em um array
      const query = `
                SELECT 
                    u.id,
                    u.username,
                    u.email,
                    u.password,
                    ARRAY_AGG(r.name) as roles
                FROM 
                    users u
                LEFT JOIN 
                    user_roles ur ON u.id = ur.user_id
                LEFT JOIN 
                    roles r ON ur.role_id = r.id
                WHERE 
                    u.email = $1
                GROUP BY 
                    u.id;
            `;

      const result = await pool.query(query, [email]);

      if (result.rows.length === 0) {
        return res
          .status(401)
          .json({ status: "error", message: "Credenciais inválidas." });
      }

      const user = result.rows[0];

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ status: "error", message: "Credenciais inválidas." });
      }

      // Se a senha estiver correta, criar o payload do JWT
      const payload = {
        id: user.id,
        username: user.username,
        roles: user.roles, // user.roles já é um array, ex: ['user'] ou ['user', 'admin']
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
      });

      res.status(200).json({
        status: "success",
        message: "Login bem-sucedido.",
        token: token,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/auth/web-login
 * @desc    Autentica o usuário e retorna um JWT
 * @access  Public
 */
router.post(
  "/web-login",
  webLoginValidationRules,
  authValidationErrors,
  async (req, res, next) => {
    try {
      const { cpf } = req.body;

      let sql = `SELECT token FROM clients WHERE cpf = $1`;
      const params = [cpf];

      let result = await pool.query(sql, params);
      //Existe o cliente com o CPF fornecido?
      if (result.rows.length === 0) {
        const newToken = crypto.randomBytes(32).toString("hex");
        params.push(newToken);

        // Insere o novo cliente com o token gerado
        const insertSql = `INSERT INTO 
                            clients (is_pre_register, cpf, token, created_at, updated_at) 
                            VALUES(true, $1, $2, now(), now())
                            RETURNING token`;

        result = await pool.query(insertSql, params);
      }

      const user = result.rows[0];
      if (!user) {
        return res
          .status(401)
          .json({ status: "error", message: "Credenciais inválidas." });
      }
      // Se a senha estiver correta, criar o payload do JWT
      const payload = {
        userToken: user.token,
        roles: ["web"], // Definindo um papel padrão para web
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
      });

      res.status(200).json({
        status: "success",
        message: "Login bem-sucedido.",
        token: token,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
