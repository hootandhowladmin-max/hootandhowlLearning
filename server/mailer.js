const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const nodemailer = require('nodemailer');

const {
  MAIL_PROVIDER,
  SMTP2GO_API_KEY,
  SMTP2GO_FROM,
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  RESEND_API_KEY,
  RESEND_FROM,
  MAILJET_API_KEY,
  MAILJET_SECRET_KEY,
  MAILJET_FROM,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM
} = process.env;

const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const resolvedHost = SMTP_HOST || DEFAULT_SMTP_HOST;
const useResend = (MAIL_PROVIDER || '').toLowerCase() === 'resend';
const useMailgun = (MAIL_PROVIDER || '').toLowerCase() === 'mailgun';
const useSmtp2go = (MAIL_PROVIDER || '').toLowerCase() === 'smtp2go';
const useMailjet = (MAIL_PROVIDER || '').toLowerCase() === 'mailjet';
const isMailerReady = useSmtp2go
  ? Boolean(SMTP2GO_API_KEY && SMTP2GO_FROM)
  : useMailgun
    ? Boolean(MAILGUN_API_KEY && MAILGUN_DOMAIN && MAILGUN_FROM)
  : useResend
    ? Boolean(RESEND_API_KEY && RESEND_FROM)
  : useMailjet
    ? Boolean(MAILJET_API_KEY && MAILJET_SECRET_KEY && MAILJET_FROM)
  : Boolean(SMTP_USER && SMTP_PASS);

let transporter = null;

if (useSmtp2go && isMailerReady) {
  console.log('[Mailer] Using SMTP2GO HTTPS API');
} else if (useMailgun && isMailerReady) {
  console.log('[Mailer] Using Mailgun HTTPS API');
} else if (useResend && isMailerReady) {
  console.log('[Mailer] Using Resend HTTPS API');
} else if (useMailjet && isMailerReady) {
  console.log('[Mailer] Using Mailjet HTTPS API');
} else if (!useResend && !useMailjet && isMailerReady) {
  // Gmail SMTP on Render must use the reachable SSL endpoint.
  const port = 465;
  console.log('[Mailer] Using SMTP server:', resolvedHost, 'port:', port);

  transporter = nodemailer.createTransport({
    host: resolvedHost,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    family: 4,
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
  console.warn(useSmtp2go
    ? '[Mailer] SMTP2GO_API_KEY / SMTP2GO_FROM missing. SMTP2GO mail is disabled.'
    : useMailgun
    ? '[Mailer] MAILGUN_API_KEY / MAILGUN_DOMAIN / MAILGUN_FROM missing. Mailgun mail is disabled.'
    : useResend
    ? '[Mailer] RESEND_API_KEY / RESEND_FROM missing. Resend mail is disabled.'
    : useMailjet
    ? '[Mailer] MAILJET_API_KEY / MAILJET_SECRET_KEY / MAILJET_FROM missing. Mailjet mail is disabled.'
    : '[Mailer] SMTP_HOST / SMTP_USER / SMTP_PASS missing. SMTP mail is disabled.');
}

function parseMailjetFrom(value) {
  if (!value) {
    return { name: '', email: '' };
  }

  const match = value.match(/^(.+?)\s*<([^<>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }

  return { name: '', email: value.trim() };
}

async function sendSmtp2goEmail({ to, subject, html, text, attachments }) {
  const body = {
    api_key: SMTP2GO_API_KEY,
    sender: SMTP2GO_FROM,
    to: [to],
    subject,
    text_body: text || subject,
    html_body: html || `<p>${text || subject}</p>`
  };

  if (attachments?.length) {
    body.attachments = attachments.map((attachment) => ({
      filename: attachment.filename,
      fileblob: Buffer.isBuffer(attachment.content)
        ? attachment.content.toString('base64')
        : Buffer.from(attachment.content).toString('base64')
    }));
  }

  const response = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`SMTP2GO API ${response.status}: ${responseBody}`);
  }

  const result = JSON.parse(responseBody);
  if (result.data?.succeeded === false || result.data?.failed) {
    throw new Error(`SMTP2GO rejected email: ${responseBody}`);
  }
  return { messageId: result.data?.email_id, response: `SMTP2GO HTTP ${response.status}` };
}

async function sendMailgunEmail({ to, subject, html, text, attachments }) {
  const form = new FormData();
  form.append('from', MAILGUN_FROM);
  form.append('to', to);
  form.append('subject', subject);
  form.append('text', text || subject);
  form.append('html', html || `<p>${text || subject}</p>`);

  for (const attachment of attachments || []) {
    const content = Buffer.isBuffer(attachment.content)
      ? new Uint8Array(attachment.content)
      : attachment.content;
    form.append('attachment', new Blob([content]), attachment.filename);
  }

  const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}`
    },
    body: form
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Mailgun API ${response.status}: ${responseBody}`);
  }

  const result = JSON.parse(responseBody);
  return { messageId: result.id, response: `Mailgun HTTP ${response.status}` };
}

async function sendMailjetEmail({ to, subject, html, text, attachments }) {
  const fromAddress = parseMailjetFrom(MAILJET_FROM);
  const body = {
    Messages: [{
      From: {
        Email: fromAddress.email,
        ...(fromAddress.name ? { Name: fromAddress.name } : {})
      },
      To: [{ Email: to }],
      Subject: subject,
      TextPart: text || subject,
      HTMLPart: html || `<p>${text || subject}</p>`
    }]
  };

  if (attachments?.length) {
    body.Messages[0].Attachments = attachments.map((attachment) => ({
      Filename: attachment.filename,
      Base64Content: Buffer.isBuffer(attachment.content)
        ? attachment.content.toString('base64')
        : Buffer.from(attachment.content).toString('base64')
    }));
  }

  const response = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Mailjet API ${response.status}: ${responseBody}`);
  }

  const result = JSON.parse(responseBody);
  const messageId = result.Messages?.[0]?.To?.[0]?.MessageID;
  return { messageId, response: `Mailjet HTTP ${response.status}` };
}

async function sendResendEmail({ to, subject, html, text, attachments }) {
  const body = {
    from: RESEND_FROM,
    to: [to],
    subject,
    text: text || subject,
    html: html || `<p>${text || subject}</p>`
  };

  if (attachments?.length) {
    body.attachments = attachments.map((attachment) => ({
      filename: attachment.filename,
      content: Buffer.isBuffer(attachment.content)
        ? attachment.content.toString('base64')
        : Buffer.from(attachment.content).toString('base64')
    }));
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Resend API ${response.status}: ${responseBody}`);
  }

  const result = JSON.parse(responseBody);
  return { messageId: result.id, response: `Resend HTTP ${response.status}` };
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

  if (!isMailerReady || (!useSmtp2go && !useMailgun && !useResend && !useMailjet && !transporter)) {
    throw new Error('Mailer not configured');
  }

  if (!to) {
    throw new Error('No recipient email provided');
  }

  try {
    const result = useSmtp2go
      ? await sendSmtp2goEmail({ to, subject, html, text, attachments })
      : useMailgun
      ? await sendMailgunEmail({ to, subject, html, text, attachments })
      : useResend
      ? await sendResendEmail({ to, subject, html, text, attachments })
      : useMailjet
      ? await sendMailjetEmail({ to, subject, html, text, attachments })
      : await transporter.sendMail({
          from: SMTP_FROM || `"Hoot & Howl Learning" <${SMTP_USER}>`,
          to,
          subject,
          text: text || subject,
          html,
          attachments
        });

    console.log(`[sendMail] SUCCESS via ${useSmtp2go ? 'SMTP2GO HTTPS API' : useMailgun ? 'Mailgun HTTPS API' : useResend ? 'Resend HTTPS API' : useMailjet ? 'Mailjet HTTPS API' : 'SMTP'}`);
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