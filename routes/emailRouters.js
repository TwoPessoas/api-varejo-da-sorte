// src/routes/emailRouters.js
const express = require("express");
const router = express.Router();

// Middlewares e Utils Genéricos
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");
const { sendWelcomeEmail, sendAdjustmentVoucherEmail, sendVoucherWinnerEmail, sendDrawEmail } = require("../services/emailService");

const welcomeEmail = async (req, res, next) => {
  try {
    const { email, name } = req.query;

    await sendWelcomeEmail({ email, name });

    res.status(200).json({
      status: "success",
      message: "Email de boas-vindas enviado com sucesso.",
    });
  } catch (error) {
    next(error);
  }
};

const adjustmentVoucherEmail = async (req, res, next) => {
  try {
    const { email, name, coupom } = req.query;

    await sendAdjustmentVoucherEmail({ email, name, coupom });

    res.status(200).json({
      status: "success",
      message: "Email de ajuste enviado com sucesso.",
    });
  } catch (error) {
    next(error);
  }
};

const voucherWinnerEmail = async (req, res, next) => {
  try {
    const { email, name, coupom } = req.query;

    await sendVoucherWinnerEmail({ email, name, coupom });

    res.status(200).json({
      status: "success",
      message: "Email de ganhador do voucher enviado com sucesso.",
    });
  } catch (error) {
    next(error);
  }
};

const drawEmail = async (req, res, next) => {
  try {
    const { email, name, coupom } = req.query;

    await sendDrawEmail({ email, name });

    res.status(200).json({
      status: "success",
      message: "Email de ganhador do sorteio enviado com sucesso.",
    });
  } catch (error) {
    next(error);
  }
};

// --- Aplicação de Middlewares ---
router.use(authenticateToken, authorizeRoles("admin"));

// --- Definição das Rotas ---
router.get("/welcome", welcomeEmail);
router.get("/adjustment-voucher", adjustmentVoucherEmail);
router.get("/voucher-winner", voucherWinnerEmail);
router.get("/draw", drawEmail);
drawEmail

module.exports = router;
