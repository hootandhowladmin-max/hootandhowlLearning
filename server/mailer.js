const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sgMail = require('@sendgrid/mail');
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
let useSendGrid = false;
let transporter = null;

if (SENDGRID_API_KEY) {
  console.log('[Mailer] Using SendGrid Official API (most reliable on Render)');
  useSendGrid = true;
  isMailerReady = true;
  sgMail.setApiKey(SENDGRID_API_KEY);
} else if (SMTP_USER && SMTP_PASS) {
  console.log('[Mailer] Using custom SMTP');
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
  
  if (!to) {
    console.error('[sendMail] ❌ ERROR: No recipient email provided!');
    throw new Error('No recipient email provided');
  }
  
  const fromAddress = SMTP_FROM || (useSendGrid ? 'hootandhowladmin@gmail.com' : SMTP_USER);
  const fromFormatted = SMTP_FROM || `"Hoot & Howl Learning" <${fromAddress}>`;
  console.log('From address:', fromFormatted);
  
  try {
    let result;
    
    if (useSendGrid) {
      // Use SendGrid's official API
      const msg = {
        to: to,
        from: fromFormatted,
        subject: subject,
        text: text || subject,
        html: html
      };
      
      // Handle attachments if present
      if (attachments && attachments.length > 0) {
        msg.attachments = attachments.map(att => ({
          content: att.content.toString('base64'),
          filename: att.filename,
          type: 'application/pdf',
          disposition: 'attachment'
        }));
      }
      
      result = await sgMail.send(msg);
      console.log('[sendMail] ✅ SUCCESS with SendGrid API!');
      console.log('SendGrid Response:', result);
    } else {
      // Fall back to SMTP if needed
      result = await transporter.sendMail({
        from: fromFormatted,
        to,
        subject,
        text: text || subject,
        html,
        attachments
      });
      
      console.log('[sendMail] ✅ SUCCESS with SMTP!');
      console.log('Message ID:', result.messageId);
      console.log('Response:', result.response);
    }
    
    console.log('=================================================');
    return result;
  } catch (err) {
    console.error('=================================================');
    console.error('[sendMail] ❌ ERROR SENDING EMAIL!');
    console.error('Error message:', err.message);
    if (err.response) {
      console.error('SendGrid Response:', err.response);
      if (err.response.body) {
        console.error('SendGrid Error Body:', JSON.stringify(err.response.body, null, 2));
      }
    }
    if (err.stack) console.error('Stack trace:', err.stack);
    console.error('=================================================');
    throw err;
  }
}

module.exports = { sendMail, isMailerReady };
