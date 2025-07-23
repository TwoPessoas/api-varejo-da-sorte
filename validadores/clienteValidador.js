const { body, validationResult } = require("express-validator");
const { subYears, isDate, parseISO } = require("date-fns");

/**
 * Função auxiliar para validar um CPF.
 * Realiza a verificação dos dígitos verificadores.
 * @param {string} cpf - O CPF a ser validado.
 * @returns {boolean} - True se o CPF for válido, false caso contrário.
 */
const validarCPF = (cpf) => {
    if (typeof cpf !== "string") return false;
    cpf = cpf.replace(/[^\d]+/g, "");
    if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;

    const digitos = cpf.split("").map((el) => +el);
    const resto = (soma) => ((soma * 10) % 11) % 10;

    let soma = digitos
        .slice(0, 9)
        .reduce((soma, el, idx) => soma + el * (10 - idx), 0);
    if (resto(soma) !== digitos[9]) return false;

    soma = digitos
        .slice(0, 10)
        .reduce((soma, el, idx) => soma + el * (11 - idx), 0);
    if (resto(soma) !== digitos[10]) return false;

    return true;
};

// Array com as regras de validação para o corpo da requisição de Cliente
const regrasDeValidacaoDoCliente = [
    body("isPreRegister")
        .notEmpty()
        .withMessage("O campo 'isPreRegister' é obrigatório.")
        .isBoolean()
        .withMessage("O campo 'isPreRegister' deve ser um valor booleano (true/false)."),

    body("cpf")
        .notEmpty()
        .withMessage("O CPF é obrigatório.")
        .custom((value) => {
            if (!validarCPF(value)) {
                throw new Error("O CPF fornecido é inválido.");
            }
            return true;
        }),

    body("name").optional({ checkFalsy: true }).isString(),

    body("birthday")
        .notEmpty()
        .withMessage("A data de nascimento é obrigatória.")
        .isISO8601()
        .withMessage("A data de nascimento deve estar no formato AAAA-MM-DD.")
        .custom((value) => {
            const dataNascimento = parseISO(value);
            if (!isDate(dataNascimento)) {
                throw new Error("Data de nascimento inválida.");
            }
            const dataDezoitoAnosAtras = subYears(new Date(), 18);
            if (dataNascimento > dataDezoitoAnosAtras) {
                throw new Error("O cliente deve ter no mínimo 18 anos.");
            }
            return true;
        }),

    body("email")
        .optional({ checkFalsy: true }) // Torna o campo opcional
        .isEmail()
        .withMessage("O email fornecido é inválido."),

    body("cel")
        .optional({ checkFalsy: true })
        .matches(/^(?:(?:\+|00)?(55)\s?)?(?:\(?([1-9][0-9])\)?\s?)?(?:((?:9\d|[2-9])\d{3})-?(\d{4}))$/)
        .withMessage("O número de celular é inválido. Use o formato (XX) 9XXXX-XXXX."),
];

/**
 * Middleware para tratar os resultados da validação.
 * Se houver erros, envia uma resposta 400 com os detalhes.
 * Se não, passa para o próximo middleware.
 */
const lidarComErrosDeValidacao = (req, res, next) => {
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
    regrasDeValidacaoDoCliente,
    lidarComErrosDeValidacao,
};