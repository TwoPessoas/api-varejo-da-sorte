// validadores/drawNumberValidador.js

const { body, validationResult } = require("express-validator");
const pool = require("../config/db");

const drawNumberValidationRules = [
  body("invoiceId")
    .notEmpty()
    .withMessage("O ID da invoice (invoiceId) é obrigatório.")
    .isInt({ gt: 0 })
    .withMessage("O ID da invoice deve ser um inteiro positivo.")
    .custom(async (value) => {
      // Validação customizada para garantir que a invoice existe
      const invoice = await pool.query(
        "SELECT id FROM invoices WHERE id = $1",
        [value]
      );
      if (invoice.rows.length === 0) {
        throw new Error("A invoice com o ID fornecido não existe.");
      }
      return true;
    }),

  body("number")
    .notEmpty()
    .withMessage("O número (number) é obrigatório.")
    .isInt()
    .withMessage("O número deve ser um inteiro."),

  body("active")
    .optional()
    .isBoolean()
    .withMessage("O campo active deve ser um valor booleano."),

  body("winnerAt")
    .optional({ nullable: true })
    .isISO8601()
    .toDate()
    .withMessage("winnerAt deve ser uma data válida no formato ISO8601."),

  body("emailSendedAt")
    .optional({ nullable: true })
    .isISO8601()
    .toDate()
    .withMessage("emailSendedAt deve ser uma data válida no formato ISO8601."),
];

const drawNumberValidationErrors = (req, res, next) => {
  const content = validationResult(req);
  if (!content.isEmpty()) {
    const erros = content.errors;
    return res.status(400).json({
      status: "error",
      message: erros[0]?.msg || "Dados inválidos.",
      erros: erros,
    });
  }
  next();
};

module.exports = {
  drawNumberValidationRules,
  drawNumberValidationErrors,
};
