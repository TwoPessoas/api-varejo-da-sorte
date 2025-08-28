// validadores/productValidador.js

const { body, validationResult } = require("express-validator");
const pool = require("../config/db");

const productValidationRules = () => [
  body("description")
    .optional({ nullable: true })
    .isString()
    .withMessage("A descrição deve ser um texto."),

  body("brand")
    .optional({ nullable: true })
    .isString()
    .withMessage("A marca deve ser um texto.")
    .isLength({ max: 255 })
    .withMessage("A marca deve ter no máximo 255 caracteres."),

  body("ean")
    .optional({ nullable: true })
    .isInt()
    .withMessage("O EAN deve ser um número inteiro.")
    .custom(async (value, { req }) => {
      if (!value) return true; // Se o EAN não for fornecido, não há o que validar.

      // Validação customizada para garantir que o EAN seja único
      let query;
      const params = [value];

      if (req.method === "PUT") {
        // Na atualização, verifica se o EAN já existe em OUTRO produto.
        query = "SELECT id FROM products WHERE ean = $1 AND id != $2";
        params.push(req.params.id);
      } else {
        // Na criação, verifica se o EAN já existe.
        query = "SELECT id FROM products WHERE ean = $1";
      }

      const product = await pool.query(query, params);
      if (product.rows.length > 0) {
        throw new Error("Este EAN já está cadastrado.");
      }
      return true;
    }),
];

const productValidationErrors = (req, res, next) => {
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
  productValidationRules,
  productValidationErrors,
};
