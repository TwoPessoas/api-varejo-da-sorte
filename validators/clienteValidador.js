const { body, param, validationResult } = require("express-validator");
const { subYears, isDate, parseISO } = require("date-fns");
const pool = require("../config/db"); // Importa o pool de conexões
const { isValidCPF } = require("../utils/stringUtils"); // Importa a função de validação de CPF

// Array com as regras de validação para o corpo da requisição de Cliente
const clientValidationRules = [
  body("isPreRegister")
    .notEmpty()
    .withMessage("O campo 'isPreRegister' é obrigatório.")
    .isBoolean()
    .withMessage(
      "O campo 'isPreRegister' deve ser um valor booleano (true/false)."
    ),

  body("cpf")
    .notEmpty()
    .withMessage("O CPF é obrigatório.")
    .custom(async (value, { req }) => {
      if (!isValidCPF(value)) throw new Error("O CPF fornecido é inválido.");

      const idClient = req.params.id; // Pega o ID da rota, se existir (para o caso de UPDATE)

      let sql = `SELECT id FROM clients WHERE cpf = $1`;
      const params = [value];

      if (idClient) {
        sql += " AND id != $2";
        params.push(idClient);
      }

      const { rows } = await pool.query(sql, params);
      if (rows.length > 0) throw new Error("Este CPF já está em uso.");

      return true;
    }),

  body("name")
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ min: 3 })
    .withMessage("O nome deve ter pelo menos 3 caracteres."),

  body("birthday")
    .notEmpty()
    .withMessage("A data de nascimento é obrigatória.")
    .isISO8601()
    .withMessage("A data de nascimento deve estar no formato AAAA-MM-DD.")
    .custom((value) => {
      const birthday = parseISO(value);
      if (!isDate(birthday)) {
        throw new Error("Data de nascimento inválida.");
      }
      const isLegalAge = subYears(new Date(), 18);
      if (birthday > isLegalAge) {
        throw new Error("O cliente deve ter no mínimo 18 anos.");
      }
      return true;
    }),

  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("O email fornecido é inválido.")
    .custom(async (value, { req }) => {
      if (!value) return true; // Se for opcional e não veio, passa
      const idCliente = req.params.id;

      let sql = "SELECT id FROM clients WHERE email = $1";
      const params = [value];

      if (idCliente) {
        sql += " AND id != $2";
        params.push(idCliente);
      }

      const { rows } = await pool.query(sql, params);
      if (rows.length > 0) throw new Error("Este email já está em uso.");

      return true;
    }),

  body("cel")
    .optional({ checkFalsy: true })
    .matches(
      /^(?:(?:\+|00)?(55)\s?)?(?:\(?([1-9][0-9])\)?\s?)?(?:((?:9\d|[2-9])\d{3})-?(\d{4}))$/
    )
    .withMessage("O número de celular é inválido.")
    .custom(async (value, { req }) => {
      if (!value) return true;
      const idCliente = req.params.id;

      let sql = "SELECT id FROM clients WHERE cel = $1";
      const params = [value];

      if (idCliente) {
        sql += " AND id != $2";
        params.push(idCliente);
      }

      const { rows } = await pool.query(sql, params);
      if (rows.length > 0) throw new Error("Este celular já está em uso.");

      return true;
    }),
];

// Array com as regras de validação para o corpo da requisição de Cliente
const clientUpdateValidationRules = [
  body("name")
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ min: 3 })
    .withMessage("O nome deve ter pelo menos 3 caracteres."),

  body("birthday")
    .notEmpty()
    .withMessage("A data de nascimento é obrigatória.")
    .isISO8601()
    .withMessage("A data de nascimento deve estar no formato AAAA-MM-DD.")
    .custom((value) => {
      const birthday = parseISO(value);
      if (!isDate(birthday)) {
        throw new Error("Data de nascimento inválida.");
      }
      const isLegalAge = subYears(new Date(), 18);
      if (birthday > isLegalAge) {
        throw new Error("O cliente deve ter no mínimo 18 anos.");
      }
      return true;
    }),

  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("O email fornecido é inválido.")
    .custom(async (value, { req }) => {
      if (!value) return true; // Se for opcional e não veio, passa
      const idCliente = req.params.id;

      let sql = "SELECT id FROM clients WHERE email = $1";
      const params = [value];

      if (idCliente) {
        sql += " AND id != $2";
        params.push(idCliente);
      }

      const { rows } = await pool.query(sql, params);
      if (rows.length > 0) throw new Error("Este email já está em uso.");

      return true;
    }),

  body("cel")
    .optional({ checkFalsy: true })
    .matches(
      /^(?:(?:\+|00)?(55)\s?)?(?:\(?([1-9][0-9])\)?\s?)?(?:((?:9\d|[2-9])\d{3})-?(\d{4}))$/
    )
    .withMessage("O número de celular é inválido.")
    .custom(async (value, { req }) => {
      if (!value) return true;
      const idCliente = req.params.id;

      let sql = "SELECT id FROM clients WHERE cel = $1";
      const params = [value];

      if (idCliente) {
        sql += " AND id != $2";
        params.push(idCliente);
      }

      const { rows } = await pool.query(sql, params);
      if (rows.length > 0) throw new Error("Este celular já está em uso.");

      return true;
    }),
];

const findByCpfRules = [
  param("cpf")
    .notEmpty()
    .withMessage("O CPF é obrigatório na URL.")
    .custom((value) => {
      if (!isValidCPF(value)) {
        throw new Error("O CPF fornecido na URL é inválido.");
      }
      return true;
    }),
];

/**
 * Middleware para tratar os resultados da validação.
 * Se houver erros, envia uma resposta 400 com os detalhes.
 * Se não, passa para o próximo middleware.
 */
const clientValidationErrors = (req, res, next) => {
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
  clientValidationRules,
  findByCpfRules,
  clientUpdateValidationRules,
  clientValidationErrors,
};
