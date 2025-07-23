// routes/authRoutes.js

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// --- IN-MEMORY USER STORE (PARA FINS DE EXEMPLO) ---
// Em uma aplicação real, você substituiria isso por chamadas ao seu banco de dados (MySQL).
// Por exemplo: const User = require('../models/User');
const users = [];
let userIdCounter = 1;

/**
 * @route   POST /api/auth/register
 * @desc    Registra um novo usuário
 * @access  Public
 */
router.post("/register", async (req, res, next) => {
    try {
        const { username, password, email } = req.body;

        // 1. Validação básica de entrada
        if (!username || !password || !email) {
            return res.status(400).json({
                status: "error",
                message: "Please provide username, email, and password.",
            });
        }

        // 2. Verificar se o usuário já existe (simulação de acesso ao DB)
        const existingUser = users.find((user) => user.email === email);
        if (existingUser) {
            return res.status(409).json({
                status: "error",
                message: "User with this email already exists.",
            });
        }

        // 3. Hash da senha com BCrypt
        // O 'salt' é gerado e incorporado ao hash automaticamente.
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10");
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 4. Salvar o novo usuário no banco de dados (simulação)
        const newUser = {
            id: userIdCounter++,
            username: username,
            email: email,
            password: hashedPassword,
            roles: ["user"], // Todo novo usuário começa com o papel 'user'
        };
        users.push(newUser);

        // eslint-disable-next-line no-console
        console.log("Users in-memory store:", users);

        // 5. Enviar resposta de sucesso
        // Não retornamos o token aqui para forçar o usuário a fazer login.
        // É uma prática comum de segurança.
        res.status(201).json({
            status: "success",
            message: "User registered successfully. Please log in.",
            data: {
                id: newUser.id,
                username: newUser.username,
            },
        });
    } catch (error) {
        // Passa o erro para o errorHandler centralizado
        next(error);
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    Autentica o usuário e retorna um JWT
 * @access  Public
 */
router.post("/login", async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // 1. Validação básica de entrada
        if (!email || !password) {
            return res
                .status(400)
                .json({ status: "error", message: "Please provide email and password." });
        }

        // 2. Encontrar o usuário no banco de dados (simulação)
        const user = users.find((user) => user.email === email);
        if (!user) {
            return res
                .status(401)
                .json({ status: "error", message: "Invalid credentials." }); // Mensagem genérica
        }

        // 3. Comparar a senha fornecida com o hash armazenado
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res
                .status(401)
                .json({ status: "error", message: "Invalid credentials." }); // Mensagem genérica
        }

        // 4. Se as credenciais estiverem corretas, criar o payload do JWT
        const payload = {
            id: user.id,
            username: user.username,
            roles: user.roles, // Incluir os papéis do usuário no token é crucial para a autorização
        };

        // 5. Gerar o token JWT
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        });

        // 6. Enviar o token para o cliente
        res.status(200).json({
            status: "success",
            message: "Logged in successfully.",
            token: token,
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;