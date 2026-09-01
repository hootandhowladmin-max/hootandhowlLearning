const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const nodemailer = require('nodemailer');
const https = require('https');

const {
  MAIL_PROVIDER,
  BREVO_API_KEY,
  BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM
} = process.env;

const useBrevo = (MAIL_PROVIDER || '').toLowerCase() === 'brevo';
const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const resolvedHost = SMTP_HOST || DEFAULT_SMTP_HOST;
const isMailerReady = useBrevo
  ? Boolean(BREVO_API_KEY && BREVO_SENDER_EMAIL)
  : Boolean(SMTP_USER && SMTP_PASS);

let transporter = null;

function sendBrevoEmail({ to, subject, html, text, attachments }) {
  const payload = {
    sender: {
      email: BREVO_SENDER_EMAIL,
      ...(BREVO_SENDER_NAME ? { name: BREVO_SENDER_NAME } : {})
    },
    to: [{ email: to }],
    subject,
    textContent: text || subject,
    htmlContent: html || `<p>${text || subject}</p>`
  };

  if (attachments?.length) {
    payload.attachment = attachments.map((attachment) => ({
      name: attachment.filename,
      content: Buffer.isBuffer(attachment.content)
        ? attachment.content.toString('base64')
        : Buffer.from(attachment.content).toString('base64')
    }));
  }

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      timeout: 30000
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          let result = {};
          try { result = JSON.parse(body); } catch (_) { /* Empty response is valid. */ }
          resolve({ messageId: result.messageId, response: `Brevo HTTP ${response.statusCode}` });
          return;
        }
        reject(new Error(`Brevo API ${response.statusCode}: ${body || response.statusMessage}`));
      });
    });

    request.on('timeout', () => request.destroy(new Error('Brevo API request timeout')));
    request.on('error', reject);
    request.end(JSON.stringify(payload));
  });
}

if (useBrevo && isMailerReady) {
  console.log('[Mailer] Using Brevo HTTP API');
} else if (!useBrevo && isMailerReady) {
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
  console.warn(useBrevo
    ? '[Mailer] BREVO_API_KEY / BREVO_SENDER_EMAIL missing. Mail is disabled.'
    : '[Mailer] SMTP_HOST / SMTP_USER / SMTP_PASS missing. SMTP mail is disabled.');
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

  if (!isMailerReady || (!useBrevo && !transporter)) {
    throw new Error('Mailer not configured');
  }

  if (!to) {
    throw new Error('No recipient email provided');
  }

  try {
    const result = useBrevo
      ? await sendBrevoEmail({ to, subject, html, text, attachments })
      : await transporter.sendMail({
          from: SMTP_FROM || `"Hoot & Howl Learning" <${SMTP_USER}>`,
          to,
          subject,
          text: text || subject,
          html,
          attachments
        });

    console.log(`[sendMail] SUCCESS via ${useBrevo ? 'Brevo API' : 'SMTP'}`);
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