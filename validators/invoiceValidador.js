const { body, validationResult } = require("express-validator");
const pool = require("../config/db");

/**
 * Função auxiliar para validar o dígito verificador do código fiscal.
 * Implementa o algoritmo de Módulo 11 (similar a CPF/CNPJ).
 * @param {string} fiscalCode - O código fiscal a ser validado.
 * @returns {boolean} True se o dígito verificador for válido, false caso contrário.
 */
const validateDigitVerification = (fiscalCode) => {
  // Garante que é uma string e contém apenas dígitos (já verificado por isNumeric, mas bom para robustez)
  if (typeof fiscalCode !== "string" || !/^\d+$/.test(fiscalCode)) {
    return false;
  }

  const fiscalCodeArray = fiscalCode.split("").map(Number); // Converte a string para um array de números
  const length = fiscalCodeArray.length;

  // O código fiscal precisa ter pelo menos 2 caracteres para que a lógica de verificação funcione (dígito + resto)
  if (length < 2) {
    return false;
  }

  const digitVerification = fiscalCodeArray[length - 1]; // Último dígito é o verificador

  let sum = 0;
  let multiplication = 2; // Multiplicador inicial

  // Itera do penúltimo dígito para o primeiro
  for (let position = length - 2; position >= 0; position--) {
    sum = sum + fiscalCodeArray[position] * multiplication;
    multiplication++;
    // Reinicia o multiplicador para 2 se ultrapassar 9
    if (multiplication > 9) {
      multiplication = 2;
    }
  }

  // Calcula o dígito esperado
  let result = 11 - (sum % 11);
  // Se o resultado for 10 ou 11, o dígito verificador é 0
  if (result >= 10) {
    result = 0;
  }

  // Compara o dígito calculado com o dígito verificador fornecido
  return digitVerification === result;
};

const addInvoiceValidationRules = [
  body("fiscalCode")
    .notEmpty()
    .withMessage("O código fiscal (fiscalCode) é obrigatório.")
    .isNumeric()
    .withMessage("O código fiscal deve conter apenas números.") // Substitui .isString() e valida "apenas número"
    .isLength({ min: 44, max: 44 })
    .withMessage("O código fiscal deve ter 44 caracteres.") // Adicionei um min: 7 com base na necessidade de ter o YYMM + dígito verificador. Ajuste se houver um tamanho fixo.
    // Validação da data da nota fiscal (Substring do ano e mês, ex: "2411" para Nov/2024)
    .custom((value, { req }) => {
      const dateInvoice = parseInt(value.substring(2, 6), 10); // Ex: "2411" se o fiscalCode for "XX2411YYYY..."
      if (isNaN(dateInvoice)) {
        // Garante que a conversão para número foi bem-sucedida
        throw new Error("Formato de data no código fiscal inválido.");
      }
      // A promoção começa a partir de Nov/2024 (2411)
      if (dateInvoice < 2411) {
        throw new Error("Nota Fiscal não pertence ao período da promoção.");
      }
      return true;
    })
    // Validação do dígito verificador (usando a função auxiliar)
    .custom((value, { req }) => {
      if (!validateDigitVerification(value)) {
        throw new Error("Nota Fiscal inválida (dígito verificador incorreto).");
      }
      return true;
    })
    // Validação de unicidade (mantida da implementação anterior)
    .custom(async (value, { req }) => {
      // Se o valor estiver vazio (já pego por .notEmpty()), não precisa checar unicidade
      if (!value) return true;

      const id = req.params.id; // Para cenários de atualização (PUT), ignora o próprio ID

      let sql = "SELECT id FROM invoices WHERE fiscal_code = $1";
      const params = [value];

      if (id) {
        // Se for uma atualização (ID presente na URL)
        sql += " AND id != $2";
        params.push(id);
      }

      const { rows } = await pool.query(sql, params);
      if (rows.length > 0) {
        throw new Error("Este código fiscal já está cadastrado.");
      }

      return true;
    }),
];


const invoiceValidationRules = [
  body("fiscalCode")
    .notEmpty()
    .withMessage("O código fiscal (fiscalCode) é obrigatório.")
    .isNumeric()
    .withMessage("O código fiscal deve conter apenas números.") // Substitui .isString() e valida "apenas número"
    .isLength({ min: 44, max: 44 })
    .withMessage("O código fiscal deve ter 44 caracteres.") // Adicionei um min: 7 com base na necessidade de ter o YYMM + dígito verificador. Ajuste se houver um tamanho fixo.
    // Validação da data da nota fiscal (Substring do ano e mês, ex: "2411" para Nov/2024)
    .custom((value, { req }) => {
      const dateInvoice = parseInt(value.substring(2, 6), 10); // Ex: "2411" se o fiscalCode for "XX2411YYYY..."
      if (isNaN(dateInvoice)) {
        // Garante que a conversão para número foi bem-sucedida
        throw new Error("Formato de data no código fiscal inválido.");
      }
      // A promoção começa a partir de Nov/2024 (2411)
      if (dateInvoice < 2411) {
        throw new Error("Nota Fiscal não pertence ao período da promoção.");
      }
      return true;
    })
    // Validação do dígito verificador (usando a função auxiliar)
    .custom((value, { req }) => {
      if (!validateDigitVerification(value)) {
        throw new Error("Nota Fiscal inválida (dígito verificador incorreto).");
      }
      return true;
    })
    // Validação de unicidade (mantida da implementação anterior)
    .custom(async (value, { req }) => {
      // Se o valor estiver vazio (já pego por .notEmpty()), não precisa checar unicidade
      if (!value) return true;

      const id = req.params.id; // Para cenários de atualização (PUT), ignora o próprio ID

      let sql = "SELECT id FROM invoices WHERE fiscal_code = $1";
      const params = [value];

      if (id) {
        // Se for uma atualização (ID presente na URL)
        sql += " AND id != $2";
        params.push(id);
      }

      const { rows } = await pool.query(sql, params);
      if (rows.length > 0) {
        throw new Error("Este código fiscal já está cadastrado.");
      }

      return true;
    }),

  // A validação de clientId permanece a mesma
  body("clientId")
    .notEmpty()
    .withMessage("O ID do cliente (clientId) é obrigatório.")
    .isInt({ gt: 0 })
    .withMessage("O ID do cliente deve ser um inteiro positivo.")
    .custom(async (value) => {
      // Verifica se o cliente realmente existe no banco de dados
      const client = await pool.query("SELECT id FROM clients WHERE id = $1", [
        value,
      ]);
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
  addInvoiceValidationRules,
};
