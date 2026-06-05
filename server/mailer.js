const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const nodemailer = require('nodemailer');

const { 
  SENDGRID_API_KEY, 
  SMTP_HOST, 
  SMTP_PORT, 
  SMTP_USER, 
  SMTP_PASS, 
  SMTP_FROM 
} = process.env;

let isMailerReady = false;
let transporter = null;
let useSendGrid = false;

if (SENDGRID_API_KEY) {
  console.log('[Mailer] Using SendGrid API...');
  useSendGrid = true;
  isMailerReady = true;
  
  // Use SendGrid's SMTP server which is reliable on Render
  transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: 'apikey',
      pass: SENDGRID_API_KEY
    },
    debug: true,
    logger: true
  });
  
} else if (SMTP_USER && SMTP_PASS) {
  console.log('[Mailer] Using custom SMTP...');
  isMailerReady = true;
  
  transporter = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(SMTP_PORT) || 587,
    secure: (parseInt(SMTP_PORT) || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false },
    debug: true,
    logger: true,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });
} else {
  console.warn('[Mailer] No mailer configured! Set either SENDGRID_API_KEY or SMTP_USER/SMTP_PASS.');
}

async function sendMail({ to, subject, html, text, attachments }) {
  console.log('=================================================');
  console.log('📧 [sendMail] STARTING!');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log('Using SendGrid:', useSendGrid);
  
  if (!isMailerReady) {
    console.error('[sendMail] ❌ ERROR: Mailer not configured!');
    throw new Error('Mailer not configured');
  }
  
  const fromAddress = SMTP_FROM || `"Hoot & Howl Learning" <${useSendGrid ? 'noreply@hoothowl.com' : SMTP_USER}>`;
  console.log('From address:', fromAddress);
  
  try {
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
    console.log('=================================================');
    
    return info;
  } catch (err) {
    console.error('=================================================');
    console.error('[sendMail] ❌ ERROR SENDING EMAIL!');
    console.error('Error message:', err.message);
    if (err.stack) console.error('Stack trace:', err.stack);
    console.error('=================================================');
    throw err;
  }
}

module.exports = { sendMail, isMailerReady };
