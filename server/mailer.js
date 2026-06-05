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
  console.log('=================================================');
  console.log('📧 [sendMail] STARTING!');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log('Text length:', (text || '').length);
  console.log('HTML length:', (html || '').length);
  console.log('Attachments:', attachments ? attachments.length : 0);
  console.log('Transporter exists:', !!transporter);
  console.log('SMTP_USER:', process.env.SMTP_USER || 'NOT SET');
  
  if (!transporter) {
    console.error('[sendMail] ❌ ERROR: Transporter not configured!');
    throw new Error('Mailer not configured');
  }
  
  const fromAddress = SMTP_FROM || `"Hoot & Howl Learning" <${SMTP_USER}>`;
  console.log('From address:', fromAddress);
  
  try {
    console.log('[sendMail] 📤 Calling transporter.sendMail...');
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text: text || subject,
      html,
      attachments
    });
    
    console.log('[sendMail] ✅ SUCCESS!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log('Accepted:', info.accepted);
    console.log('Rejected:', info.rejected);
    console.log('Pending:', info.pending);
    console.log('=================================================');
    
    return info;
  } catch (err) {
    console.error('=================================================');
    console.error('[sendMail] ❌ ERROR SENDING EMAIL!');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error command:', err.command);
    console.error('Full error:', err);
    if (err.stack) console.error('Stack trace:', err.stack);
    console.error('=================================================');
    throw err;
  }
}

module.exports = { sendMail, isMailerReady };
