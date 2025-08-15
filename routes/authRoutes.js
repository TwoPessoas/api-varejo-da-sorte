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
const { sendSecurityEmail } = require("../services/emailService");
const { isEmpty } = require("../utils/stringUtils");
const { logActivity } = require("../utils/logger");

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
      const { cpf, securityToken } = req.body;

      // --- 1. OPERAÇÃO ATÔMICA DE UPSERT E BUSCA ---
      // Primeiro, tenta inserir o cliente. Se já existir um com o mesmo CPF, não faz nada.
      // Isso previne race conditions e prepara o terreno de forma atômica.
      const newToken = crypto.randomBytes(32).toString("hex");
      const upsertSql = `
        INSERT INTO clients (is_pre_register, cpf, token, security_token, created_at, updated_at)
        VALUES (true, $1, $2, $3, now(), now())
        ON CONFLICT (cpf) DO NOTHING;
      `;
      await pool.query(upsertSql, [cpf, newToken, securityToken]);

      // Agora, com certeza o cliente existe (seja o que acabamos de inserir ou um pré-existente).
      // Buscamos os dados dele em uma única query garantida.
      const selectSql = `SELECT * FROM clients WHERE cpf = $1`;
      const userResult = await pool.query(selectSql, [cpf]);

      // Se por algum motivo MUITO estranho o usuário não for encontrado aqui, é um erro de servidor.
      if (userResult.rows.length === 0) {
        throw new Error(
          "Falha crítica na lógica de login: usuário não encontrado após UPSERT."
        );
      }
      const user = userResult.rows[0];

      // CASO 1: O security_token no banco é diferente do enviado (acesso de novo dispositivo)
      if (user.security_token !== securityToken) {
        //verifica se o user é um pre-cadastro
        if (user.is_pre_register || isEmpty(user.email)) {
          // Atualiza o security_token
          await pool.query(
            "UPDATE clients SET security_token = $1 WHERE id = $2",
            [securityToken, user.id]
          );
        } else {
          // A lógica de rate limit e envio de email foi extraída para uma função para maior clareza.
          return await handleMismatchedSecurityToken(user, securityToken, res);
        }
      }

      // Se chegamos aqui, o security_token bate com o do banco.
      // Este é o "caminho feliz".

      // --- 3. GERAÇÃO DO JWT E RESPOSTA DE SUCESSO ---
      const payload = {
        userToken: user.token, // Assumindo que o token de usuário (UUID) é gerado por padrão no DB ou em outro lugar
        roles: ["web"],
      };

      const jwtToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
      });

      return res.status(200).json({
        status: "success",
        message: "Login bem-sucedido.",
        token: jwtToken,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Função auxiliar para lidar com a lógica de token de segurança divergente.
 * Isso limpa o handler principal do endpoint.
 */
async function handleMismatchedSecurityToken(user, newSecurityToken, res) {
  const now = new Date();
  const nowInSeconds = Math.floor(now.getTime() / 1000);
  const fifteenMinutesInSeconds = 15 * 60;

  if (user.security_token_email_sended_at) {
    const emailSentAtInSeconds = Math.floor(
      user.security_token_email_sended_at.getTime() / 1000
    );
    if (emailSentAtInSeconds + fifteenMinutesInSeconds > nowInSeconds) {
      return res.status(429).json({
        // 429 Too Many Requests é mais semântico aqui
        status: "error",
        message:
          "Você já deve ter recebido o e-mail de autorização. Verifique sua caixa de entrada e spam.",
      });
    }
  }

  // Atualiza o timestamp do envio de e-mail
  await pool.query(
    "UPDATE clients SET security_token_email_sended_at = $1 WHERE id = $2",
    [now.toISOString(), user.id]
  );

  const payload = {
    userToken: user.token, // Identificador único do usuário
    newSecurityToken: newSecurityToken, // O novo token a ser definido
    aud: "security-token-update", // 'Audience' - especifica o propósito do token
  };

  const linkToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "15m", // O JWT já controla a expiração!
  });

  // Envia o e-mail com o novo `linkToken`
  await sendSecurityEmail({
    name: user.name,
    email: user.email,
    token: linkToken, // Envia o JWT
  });

  return res.status(403).json({
    // 403 Forbidden é adequado
    status: "error",
    message:
      "Você está tentando acessar através de um dispositivo não autorizado. Um e-mail foi enviado para permitir o acesso.",
  });
}

/**
 * @route   PUT /api/auth/update-security-token
 * @desc    Atualização do token de segurança do dispositivo
 * @access  Public
 */
router.put("/update-security-token", async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      status: "error",
      message: "Token de autorização não fornecido.",
    });
  }

  try {
    // --- 1. VERIFICAÇÃO SEGURA E INTEGRADA DO JWT ---
    const decodedPayload = jwt.verify(token, process.env.JWT_SECRET, {
      audience: "security-token-update", // Garante que o token foi gerado para este propósito
    });

    // O `jwt.verify` já lança um erro se o token for inválido, adulterado ou expirado.
    // O bloco catch abaixo cuidará desses erros automaticamente.

    const { userToken, newSecurityToken } = decodedPayload;

    // --- 2. QUERY DE UPDATE ATÔMICA E EFICIENTE ---
    // Atualizamos o security_token diretamente, usando o userToken como identificador único.
    // A cláusula `RETURNING id` nos permite verificar se alguma linha foi de fato atualizada.
    const updateSql = `
      UPDATE clients 
      SET security_token = $1, updated_at = now() 
      WHERE token = $2 
      RETURNING id;
    `;
    const result = await pool.query(updateSql, [newSecurityToken, userToken]);

    // Se `rowCount` for 0, significa que o `userToken` não correspondeu a nenhum cliente.
    if (result.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Usuário associado a este token não foi encontrado.",
      });
    }

    const updatedClientId = result.rows[0].id;

    // --- 3. LOG DE AUDITORIA ---
    await logActivity(
      updatedClientId, // Usando o ID retornado
      "UPDATE_SECURITY_TOKEN",
      { type: "clients", id: updatedClientId },
      { source: "email_link" } // Log mais simples e relevante
    );

    return res.status(200).json({
      status: "success",
      message:
        "Seu dispositivo foi autorizado com sucesso. Você já pode fazer o login.",
    });
  } catch (error) {
    // O bloco catch agora lida com vários tipos de erro do JWT
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        status: "error",
        message:
          "Token expirado. Por favor, tente fazer o login novamente para gerar um novo link.",
      });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res
        .status(401)
        .json({ status: "error", message: "Token inválido ou malformado." });
    }
    // Para outros erros, passa para o middleware de erro padrão
    next(error);
  }
});

module.exports = router;
