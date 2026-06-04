const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const nodemailer = require('nodemailer');

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
const isMailerReady = Boolean(SMTP_USER && SMTP_PASS);

let transporter = null;
if (isMailerReady) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(SMTP_PORT) || 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  console.log('[Mailer] SMTP transporter configured');
} else {
  console.warn('[Mailer] Missing SMTP_USER/SMTP_PASS in .env. Email features will be disabled.');
}

async function sendMail({ to, subject, html, text, attachments }) {
  if (!transporter) throw new Error('Mailer not configured');
  const fromAddress = SMTP_FROM || `"Hoot & Howl Learning" <${SMTP_USER}>`;
  const info = await transporter.sendMail({
    from: fromAddress,
    to, subject, text, html, attachments
  });
  return info;
}

module.exports = { sendMail, isMailerReady };
