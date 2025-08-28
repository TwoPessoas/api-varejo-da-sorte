// validadores/gameOpportunityValidador.js

const { body, validationResult } = require("express-validator");
const pool = require("../config/db");

const gameOpportunityValidationRules = [
  body("gift")
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage("O campo gift deve ter no máximo 255 caracteres."),

  body("active")
    .optional()
    .isBoolean()
    .withMessage("O campo active deve ser um valor booleano."),

  body("usedAt")
    .optional({ nullable: true }) // Permite que seja nulo
    .isISO8601()
    .toDate()
    .withMessage("O campo usedAt deve ser uma data válida no formato ISO8601."),

  body("invoiceId")
    .optional({ nullable: true }) // O vínculo com a invoice é opcional
    .isInt({ gt: 0 })
    .withMessage("O ID da invoice deve ser um inteiro positivo.")
    .custom(async (value) => {
      if (value) {
        // Se um ID de invoice for fornecido, verifica se ele existe
        const invoice = await pool.query(
          "SELECT id FROM invoices WHERE id = $1",
          [value]
        );
        if (invoice.rows.length === 0) {
          throw new Error("A invoice com o ID fornecido não existe.");
        }
      }
      return true;
    }),
];

// Função helper para lidar com erros (pode ser movida para um arquivo utilitário compartilhado no futuro)
const gameOpportunityValidationErrors = (req, res, next) => {
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
  gameOpportunityValidationRules,
  gameOpportunityValidationErrors,
};
