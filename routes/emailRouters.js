// src/routes/emailRouters.js
const express = require("express");
const router = express.Router();

// Middlewares e Utils Genéricos
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");
const { sendWelcomeEmail, sendAdjustmentVoucherEmail, sendVoucherWinnerEmail, sendDrawEmail } = require("../services/emailService");
const pool = require("../config/db");

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

const testeNow = async (req, res, next) => {
  try {
    const request = await pool.query("SELECT NOW()");

    res.status(200).json({
      status: "success",
      message: request.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const testeVouchers = async (req, res, next) => {
  try {
    const request = await pool.query(
      `SELECT * FROM vouchers
      WHERE draw_date <= now()
      ORDER BY draw_date ASC`);

    res.status(200).json({
      status: "success",
      message: JSON.stringify(request.rows),
    });
  } catch (error) {
    next(error);
  }
};

const testeVouchersV2 = async (req, res, next) => {
  try {
    const d = new Date();
    d.setHours(d.getHours() - 3); // Ajusta para GMT-3 (horário de Brasília)
    const request = await pool.query(
      `SELECT * FROM vouchers
      WHERE draw_date <= NOW() - interval '3 hours'
      ORDER BY draw_date ASC`);

    res.status(200).json({
      status: "success",
      message: JSON.stringify(request.rows),
      data: d.toISOString(),
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

router.get("/teste-now", testeNow);
router.get("/teste-vouchers", testeVouchers);
router.get("/teste-vouchers-v2", testeVouchersV2);
drawEmail

module.exports = router;
