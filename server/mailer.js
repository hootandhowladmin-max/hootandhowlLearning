const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM
} = process.env;

const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const resolvedHost = SMTP_HOST || DEFAULT_SMTP_HOST;
const isMailerReady = Boolean(SMTP_USER && SMTP_PASS);

let transporter = null;

if (isMailerReady) {
  const port = Number(SMTP_PORT) || 587;
  console.log('[Mailer] Using SMTP server:', resolvedHost, 'port:', port);

  transporter = nodemailer.createTransport({
    host: resolvedHost,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });

  transporter.verify((error, success) => {
    if (error) {
      console.error('[Mailer] SMTP connection FAILED:', error.message);
    } else {
      console.log('[Mailer] SMTP connection SUCCESSFUL');
    }
  });
} else {
  console.warn('[Mailer] SMTP_HOST / SMTP_USER / SMTP_PASS missing. SMTP mail is disabled.');
}

async function sendMail({
  to,
  subject,
  html,
  text,
  attachments
}) {
  console.log('=================================================');
  console.log('[sendMail] STARTING');
  console.log('To:', to);
  console.log('Subject:', subject);

  if (!isMailerReady || !transporter) {
    throw new Error('Mailer not configured');
  }

  if (!to) {
    throw new Error('No recipient email provided');
  }

  const from = SMTP_FROM || `"Hoot & Howl Learning" <${SMTP_USER}>`;

  try {
    const result = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || subject,
      html,
      attachments
    });

    console.log('[sendMail] SUCCESS via SMTP');
    console.log('Message ID:', result.messageId);
    console.log('Response:', result.response);
    console.log('=================================================');

    return result;
  } catch (err) {
    console.error('[sendMail] ERROR:', err.message);

    if (err.response) {
      console.error('SMTP Response:', err.response);
    }

    console.error(err.stack);
    console.log('=================================================');

    throw err;
  }
}

module.exports = {
  sendMail,
  isMailerReady
};