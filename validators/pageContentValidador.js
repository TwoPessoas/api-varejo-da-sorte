// validadores/pageContentValidador.js

const { body, validationResult } = require("express-validator");
const pool = require("../config/db");

const isSlugValid = async (slug, id) => {
  // Verifica se o slug contém apenas letras minúsculas, números e hífens
  if (!slug || typeof slug !== "string") return false;
  if (slug.length > 45) return false; // Limite de 45 caracteres
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false; // Regex para validar o formato do slug

  // Validação customizada para garantir que o slug seja único
  let query;
  const params = [slug];

  if (id) {
    // Na atualização, o slug pode ser o mesmo do registro atual.
    // Precisamos verificar se o slug já existe em OUTRO registro.
    query = "SELECT id FROM page_contents WHERE slug = $1 AND id != $2";
    params.push(id);
  } else {
    // Na criação, basta verificar se o slug já existe.
    query = "SELECT id FROM page_contents WHERE slug = $1";
  }

  const pageContent = await pool.query(query, params);
  if (pageContent.rows.length > 0) {
    return false; // Slug já existe
  }
  return true;
};

const pageContentValidationRules = () => [
  body("title")
    .notEmpty()
    .withMessage("O título é obrigatório.")
    .isString()
    .isLength({ max: 45 })
    .withMessage("O título deve ter no máximo 45 caracteres."),

  body("content").optional().isString(),
];

const pageContentValidationErrors = (req, res, next) => {
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
  pageContentValidationRules,
  pageContentValidationErrors,
  isSlugValid,
};
