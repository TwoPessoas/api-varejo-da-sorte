const { body, validationResult } = require("express-validator");
const { subYears, isDate, parseISO } = require("date-fns");
const pool = require("../config/db"); // Importa o pool de conexões

// Array com as regras de validação para o corpo da requisição de Cliente
const userValidationRules = [
    body("username")
        .notEmpty()
        .withMessage("O campo 'username' é obrigatório.")
        .isLength({ min: 3 })
        .withMessage("O campo 'username' deve ter pelo menos 3 caracteres."),

    body("password")
        .notEmpty()
        .withMessage("O campo 'password' é obrigatório.")
        .isLength({ min: 6 })
        .withMessage("O campo 'password' deve ter pelo menos 6 caracteres."),

    body("email")
        .optional({ checkFalsy: true })
        .isEmail().withMessage("O email fornecido é inválido."),
];

/**
 * Middleware para tratar os resultados da validação.
 * Se houver erros, envia uma resposta 400 com os detalhes.
 * Se não, passa para o próximo middleware.
 */
const userValidationErrors = (req, res, next) => {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
        return res.status(400).json({
            status: "error",
            message: "Dados inválidos.",
            erros: erros.array(),
        });
    }
    next();
};

module.exports = {
    userValidationRules,
    userValidationErrors,
};