const express = require("express");
const router = express.Router();
const {
    authenticateToken,
    authorizeRoles,
} = require("../middleware/authMiddleware");
const {
    regrasDeValidacaoDoCliente,
    lidarComErrosDeValidacao,
} = require("../validadores/clienteValidador");

// --- BANCO DE DADOS EM MEMÓRIA (PARA EXEMPLO) ---
// Substitua por chamadas ao seu banco de dados MySQL.
const clientes = [];
let clienteIdCounter = 1;

// Rota para CRIAR um novo cliente (CREATE)
// Apenas 'admin' pode criar.
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin"),
    regrasDeValidacaoDoCliente, // Aplica as regras de validação
    lidarComErrosDeValidacao,  // Trata os erros de validação
    (req, res) => {
        const { isPreRegister, name, cpf, birthday, cel, email, token } = req.body;

        const novoCliente = {
            id: clienteIdCounter++,
            isPreRegister,
            name,
            cpf: cpf.replace(/[^\d]+/g, ""), // Armazena apenas números
            birthday,
            cel,
            email,
            token,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        clientes.push(novoCliente);
        res.status(201).json({
            status: "success",
            message: "Cliente criado com sucesso.",
            data: novoCliente,
        });
    }
);

// Rota para LER todos os clientes (READ ALL)
// 'admin' e 'web' podem ler.
router.get(
    "/",
    authenticateToken,
    authorizeRoles("admin", "web"),
    (req, res) => {
        res.status(200).json({ status: "success", data: clientes });
    }
);

// Rota para LER um cliente específico por ID (READ ONE)
// 'admin' e 'web' podem ler.
router.get(
    "/:id",
    authenticateToken,
    authorizeRoles("admin", "web"),
    (req, res) => {
        const cliente = clientes.find((c) => c.id === parseInt(req.params.id));
        if (!cliente) {
            return res.status(404).json({
                status: "error",
                message: "Cliente não encontrado.",
            });
        }
        res.status(200).json({ status: "success", data: cliente });
    }
);

// Rota para ATUALIZAR um cliente (UPDATE)
// Apenas 'admin' pode atualizar.
router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    regrasDeValidacaoDoCliente,
    lidarComErrosDeValidacao,
    (req, res) => {
        const clienteIndex = clientes.findIndex(
            (c) => c.id === parseInt(req.params.id)
        );
        if (clienteIndex === -1) {
            return res.status(404).json({
                status: "error",
                message: "Cliente não encontrado.",
            });
        }

        const { isPreRegister, name, cpf, birthday, cel, email, token } = req.body;

        const clienteAtualizado = {
            ...clientes[clienteIndex],
            isPreRegister,
            name,
            cpf: cpf.replace(/[^\d]+/g, ""),
            birthday,
            cel,
            email,
            token,
            updatedAt: new Date().toISOString(),
        };

        clientes[clienteIndex] = clienteAtualizado;
        res.status(200).json({
            status: "success",
            message: "Cliente atualizado com sucesso.",
            data: clienteAtualizado,
        });
    }
);

// Rota para DELETAR um cliente (DELETE)
// Apenas 'admin' pode deletar.
router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    (req, res) => {
        const clienteIndex = clientes.findIndex(
            (c) => c.id === parseInt(req.params.id)
        );
        if (clienteIndex === -1) {
            return res.status(404).json({
                status: "error",
                message: "Cliente não encontrado.",
            });
        }

        clientes.splice(clienteIndex, 1);
        res.status(204).send(); // 204 No Content
    }
);

module.exports = router;