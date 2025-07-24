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
    findByCpfRules,
    clientValidationErrors 
} = require("../validators/clienteValidador");
const { clientMaskInfo } = require("../utils/maskInfo");

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
            const [rows] = await pool.execute('SELECT * FROM clientes WHERE cpf = $1', [cpfParam]);
            
            let cliente;

            if (rows.length > 0) {
                // 2a. Se encontrou, usa o cliente existente
                cliente = rows[0];
            } else {
                // 2b. Se NÃO encontrou, cria um novo cliente (pré-registro)
                const sqlInsert = 'INSERT INTO clients (cpf, isPreRegister, createdAt, updatedAt) VALUES ($1, $2, NOW(), NOW()) RETURNING *';
                const result = await pool.execute(sqlInsert, [cpfParam, true]);

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
);

// Rota para CRIAR um novo client (CREATE)
// Apenas 'admin' pode criar.
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin"),
    clientValidationRules,// Aplica as regras de validação
    clientValidationErrors,// Trata os erros de validação
    async (req, res, next) => {
        try {
            const { isPreRegister, name, cpf, birthday, cel, email } = req.body;

            // 2. GERAR O TOKEN SEGURO
            // crypto.randomBytes(32) gera 32 bytes de dados aleatórios.
            // .toString('hex') converte esses bytes para uma string hexadecimal de 64 caracteres.
            const tokenGerado = crypto.randomBytes(32).toString("hex");

            // 3. SQL
            // Incluímos as colunas `token`, `createdAt` e `updatedAt`.
            // Usamos a função NOW() do PostgreSQL para garantir o timestamp do banco de dados,
            // que é a prática mais robusta.
            const sql = `INSERT INTO clientes 
                            (isPreRegister, name, cpf, birthday, cel, email, token, createdAt, updatedAt)
                         VALUES 
                            ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) 
                         RETURNING *`;
            
            // 4. ADICIONAR O TOKEN GERADO AOS PARÂMETROS
            const params = [
                isPreRegister,
                name,
                cpf,
                birthday,
                cel,
                email,
                tokenGerado,
            ];

            const result = await pool.query(sql, params);

            res.status(201).json({
                status: "success",
                message: "Cliente criado com sucesso.",
                data: result.rows[0],
            });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para LER todos os clients (READ ALL)
// Apenas 'admin' pode ler.
router.get(
    "/",
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res, next) => {
        try {
            const [rows] = await pool.execute('SELECT * FROM clientes');
            res.status(200).json({ status: "success", data: rows });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para LER um client específico por ID (READ ONE)
// Apenas 'admin' podem ler.
router.get(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const [rows] = await pool.execute('SELECT * FROM clientes WHERE id = ?', [id]);
            if (rows.length === 0) {
                return res.status(404).json({ status: "error", message: "Cliente não encontrado." });
            }
            res.status(200).json({ status: "success", data: rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para ATUALIZAR um client (UPDATE)
// Apenas 'admin' pode atualizar.
router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    clientValidationRules,
    clientValidationErrors,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { isPreRegister, name, cpf, birthday, cel, email, token } = req.body;
            
            // MUDANÇA: A cláusula `updatedAt` é definida explicitamente
            const sql = `UPDATE clientes SET 
                            isPreRegister = $1, name = $2, cpf = $3, birthday = $4, 
                            cel = $5, email = $6, token = $7, updatedAt = NOW()
                         WHERE id = $8 RETURNING *`;
            const params = [isPreRegister, name, cpf, birthday, cel, email, token, id];

            const result = await pool.query(sql, params);
            // MUDANÇA: de affectedRows para rowCount
            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Cliente não encontrado." });
            }

            res.status(200).json({ status: "success", message: "Cliente atualizado com sucesso.", data: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }
);

// Rota para DELETAR um client (DELETE)
// Apenas 'admin' pode deletar.
router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
     async (req, res, next) => {
        try {
            const { id } = req.params;
            const result = await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
            // MUDANÇA: de affectedRows para rowCount
            if (result.rowCount === 0) {
                return res.status(404).json({ status: "error", message: "Cliente não encontrado." });
            }
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;