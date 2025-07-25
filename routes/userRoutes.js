const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const pool = require("../config/db"); // Importa o pool de conexões
const {
    authenticateToken,
    authorizeRoles,
} = require("../middleware/authMiddleware");
const { 
    userValidationRules, 
    userValidationErrors 
} = require("../validators/userValidador");


// Rota para CRIAR um novo usuario (CREATE)
// Apenas 'admin' pode criar.
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin"),
    userValidationRules,// Aplica as regras de validação
    userValidationErrors,// Trata os erros de validação
    async (req, res, next) => {
        // Para garantir a consistência dos dados, usaremos uma transação
        const repository = await pool.connect();

        try {
            await repository.query("BEGIN"); // Inicia a transação

            const { username, password, email, role } = req.body;

            // 1. Verificar se o usuário já existe
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

            // 2. Hash da senha
            const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10");
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // 3. Inserir o novo usuário na tabela 'usuarios'
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

            // 4. Obter o ID do papel 'user'
            const roleResult = await repository.query("SELECT id FROM roles WHERE name = $1", [role || 'user']);
            if (roleResult.rows.length === 0) {
                // Isso seria um erro de configuração do sistema
                throw new Error("O grupo de permissão não foi encontrado.");
            }
            const userRoleId = roleResult.rows[0].id;

            // 6. Vincular o novo usuário ao papel 'user' na tabela 'user_roles'
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
            // 9. Libera o usuarioe de volta para o pool, independentemente do resultado
            repository.release();
        }
    }
);

// Rota para LER todos os usuarios (READ ALL)
// Apenas 'admin' pode ler.
router.get(
    "/",
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res, next) => {
        try {
            const {rows} = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
            res.status(200).json({ status: "success", data: rows });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para LER um usuario específico por ID (READ ONE)
// Apenas 'admin' podem ler.
router.get(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const {rows} = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
            if (rows.length === 0) {
                return res.status(404).json({ status: "error", message: "Usuário não encontrado." });
            }
            res.status(200).json({ status: "success", data: rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

/*
// Rota para ATUALIZAR um usuario (UPDATE)
// Apenas 'admin' pode atualizar.
router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    userValidationRules,
    userValidationErrors,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { isPreRegister, name, cpf, birthday, cel, email, token } = req.body;
            
            // MUDANÇA: A cláusula `updatedAt` é definida explicitamente
            const sql = `UPDATE usuarioes SET 
                            isPreRegister = $1, name = $2, cpf = $3, birthday = $4, 
                            cel = $5, email = $6, token = $7, updatedAt = NOW()
                         WHERE id = $8 RETURNING *`;
            const params = [isPreRegister, name, cpf, birthday, cel, email, token, id];

            const result = await pool.query(sql, params);
            // MUDANÇA: de affectedRows para rowCount
            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "usuarioe não encontrado." });
            }

            res.status(200).json({ status: "success", message: "usuarioe atualizado com sucesso.", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);*/

// Rota para DELETAR um usuario (DELETE)
// Apenas 'admin' pode deletar.
router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
     async (req, res, next) => {
        try {
            const { id } = req.params;
            const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
            // MUDANÇA: de affectedRows para rowCount
            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Usuário não encontrado." });
            }
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;