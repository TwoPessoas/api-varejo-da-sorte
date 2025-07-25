// validadores/invoiceValidador.js

const { body, validationResult } = require("express-validator");
const pool = require("../config/db");

const invoiceValidationRules = [
    body("fiscal_code")
        .notEmpty().withMessage("O código fiscal (fiscal_code) é obrigatório.")
        .isString()
        .isLength({ max: 50 }).withMessage("O código fiscal deve ter no máximo 50 caracteres.")
        .custom(async (value, { req }) => {
            if (!value) return true;
            const id = req.params.id;

            let sql = 'SELECT id FROM invoices WHERE fiscal_code = $1';
            const params = [value];

            if (id) {
                sql += ' AND id != $2';
                params.push(id);
            }

            const {rows} = await pool.query(sql, params);
            if (rows.length > 0) throw new Error("Este código fiscal já está cadastrado.");

            return true;
        }),

    /*
    body("invoce_value")
        .notEmpty().withMessage("O valor da nota (invoce_value) é obrigatório.")
        .isDecimal({ decimal_digits: '1,2' }).withMessage("O valor da nota deve ser um número decimal com até 2 casas.")
        .toFloat(),

    body("has_item").optional().isBoolean().withMessage("has_item deve ser um valor booleano."),
    body("has_creditcard").optional().isBoolean().withMessage("has_creditcard deve ser um valor booleano."),
    body("has_partner_code").optional().isBoolean().withMessage("has_partner_code deve ser um valor booleano."),

    body("pdv").optional().isInt().withMessage("pdv deve ser um número inteiro."),
    body("store").optional().isInt().withMessage("store deve ser um número inteiro."),
    body("num_coupon").optional().isInt().withMessage("num_coupon deve ser um número inteiro longo."),
    body("cnpj").optional().isInt().withMessage("cnpj deve ser um número inteiro longo."),
    body("creditcard").optional().isString().isLength({ max: 45 }),
    */
    body("client_id")
        .notEmpty().withMessage("O ID do cliente (client_id) é obrigatório.")
        .isInt({ gt: 0 }).withMessage("O ID do cliente deve ser um inteiro positivo.")
        .custom(async (value) => {
            // Verifica se o cliente realmente existe no banco de dados
            const client = await pool.query("SELECT id FROM clients WHERE id = $1", [value]);
            if (client.rows.length === 0) {
                throw new Error("O cliente com o ID fornecido não existe.");
            }
            return true;
        }),
];

const invoiceValidationErrors = (req, res, next) => {
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
    invoiceValidationRules,
    invoiceValidationErrors,
};