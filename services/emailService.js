const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

// Carrega as variáveis de ambiente. É importante garantir que elas estejam disponíveis aqui.
require("dotenv").config();

// 1. Configuração do Transporter do Nodemailer
// Esta configuração é feita uma única vez, quando o módulo é carregado.
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Função genérica para preparar o template HTML, substituindo os placeholders.
 * @param {string} templateName - O nome do arquivo de template (ex: 'security_autorization.html').
 * @param {object} replacements - Um objeto onde a chave é o nome do placeholder (sem <%%>) e o valor é o que será substituído.
 * @returns {string} - O conteúdo HTML com as substituições feitas.
 */
function prepareHtmlTemplate(templateName, replacements) {
  const templatePath = path.join(__dirname, "..", "templates", templateName); // O '..' volta um nível de pasta
  let html = fs.readFileSync(templatePath, "utf-8");

  // Itera sobre o objeto de substituições e aplica cada uma
  for (const key in replacements) {
    // Cria uma RegExp para substituir todas as ocorrências do placeholder
    const regex = new RegExp(`<%${key}%>`, "g");
    html = html.replace(regex, replacements[key]);
  }

  return html;
}

/**
 * Envia o e-mail de autorização de segurança.
 * @param {object} data - Objeto contendo os dados do cliente.
 * @param {string} data.name - Nome do cliente.
 * @param {string} data.email - E-mail do destinatário.
 * @param {string} data.token - E-mail do destinatário.
 */
async function sendSecurityEmail(data) {
  console.log(`Preparando e-mail de segurança para: ${data.email}`);

  try {
    // Prepara o conteúdo do e-mail usando o template
    const htmlContent = prepareHtmlTemplate("security_autorization.html", {
      NAME: data.name,
      CAMPAIGN_NAME: process.env.CAMPAIGN_NAME,
      LINK_AUTHORIZATION:
        process.env.FRONTEND_BASE_URL +
        "/consentir-alteracao-seguranca?q=" +
        data.token,
    });

    const mailOptions = {
      from: `[${process.env.CAMPAIGN_NAME}] <${process.env.EMAIL_USER}>`,
      to: data.email,
      subject: "Notificação de Segurança Importante",
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `E-mail de segurança enviado com sucesso para ${data.email}. Message ID: ${info.messageId}`
    );

    // Retorna o sucesso e o ID da mensagem para quem chamou a função
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(
      `Falha ao enviar e-mail de segurança para ${data.email}:`,
      error
    );
    // Lança o erro para que a camada que chamou (a rota) possa tratá-lo
    throw new Error("Falha no serviço de envio de e-mail.");
  }
}

async function sendVoucherWinnerEmail(data) {
  console.log(`Preparando e-mail de vencedor do voucher para: ${data.email}`);

  try {
    // Prepara o conteúdo do e-mail usando o template
    const htmlContent = prepareHtmlTemplate("email_voucher.html", {
      NAME: data.name,
      COUPOM: data.coupom,
    });

    const mailOptions = {
      from: `[${process.env.CAMPAIGN_NAME}] <${process.env.EMAIL_USER}>`,
      to: data.email,
      subject: "Código premiado Atakarejo",
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `E-mail de vencedor do voucher enviado com sucesso para ${data.email}. Message ID: ${info.messageId}`
    );

    // Retorna o sucesso e o ID da mensagem para quem chamou a função
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(
      `Falha ao enviar e-mail de segurança para ${data.email}:`,
      error
    );
    // Lança o erro para que a camada que chamou (a rota) possa tratá-lo
    throw new Error("Falha no serviço de envio de e-mail.");
  }
}

// Exportamos a função que queremos que seja pública (reutilizável)
module.exports = {
  sendSecurityEmail,
  sendVoucherWinnerEmail,
};
