// validadores/voucherValidador.js

const { body, validationResult } = require("express-validator");
const pool = require("../config/db");

const voucherValidationRules = () => [
    body("coupom")
        .notEmpty().withMessage("O código do cupom é obrigatório.")
        .isString().withMessage("O cupom deve ser um texto.")
        .isLength({ max: 255 }).withMessage("O cupom deve ter no máximo 255 caracteres.")
        .custom(async (value, { req }) => {
            // Validação para garantir que o 'coupom' é único.
            const query = req.method === 'PUT'
                ? "SELECT id FROM vouchers WHERE coupom = $1 AND id != $2"
                : "SELECT id FROM vouchers WHERE coupom = $1";
            
            const params = req.method === 'PUT' ? [value, req.params.id] : [value];
            const voucher = await pool.query(query, params);

            if (voucher.rows.length > 0) {
                throw new Error("Este código de cupom já está em uso.");
            }
            return true;
        }),

    body("game_opportunity_id")
        .optional({ nullable: true })
        .isInt({ gt: 0 }).withMessage("O ID da oportunidade de jogo deve ser um inteiro positivo.")
        .custom(async (value, { req }) => {
            if (!value) return true; // Se não for fornecido, não há o que validar.

            // 1. Verifica se a oportunidade de jogo existe.
            const opportunity = await pool.query("SELECT id FROM game_opportunities WHERE id = $1", [value]);
            if (opportunity.rows.length === 0) {
                throw new Error("A oportunidade de jogo informada não existe.");
            }

            // 2. Verifica se a oportunidade de jogo já está vinculada a OUTRO voucher (regra do One-to-One).
            const query = req.method === 'PUT'
                ? "SELECT id FROM vouchers WHERE game_opportunity_id = $1 AND id != $2"
                : "SELECT id FROM vouchers WHERE game_opportunity_id = $1";
            
            const params = req.method === 'PUT' ? [value, req.params.id] : [value];
            const voucherLink = await pool.query(query, params);

            if (voucherLink.rows.length > 0) {
                throw new Error("Esta oportunidade de jogo já está associada a outro voucher.");
            }
            return true;
        }),

    body("draw_date")
        .optional({ nullable: true })
        .isISO8601().toDate().withMessage("A data do sorteio deve ser uma data válida no formato ISO8601."),

    body("voucher_value")
        .optional({ nullable: true })
        .isInt().withMessage("O valor do voucher deve ser um número inteiro."),

    body("email_sended_at")
        .optional({ nullable: true })
        .isISO8601().toDate().withMessage("A data de envio do e-mail deve ser válida no formato ISO8601."),
];

const voucherValidationErrors = (req, res, next) => {
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
    voucherValidationRules,
    voucherValidationErrors,
};