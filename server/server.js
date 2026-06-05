const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-core');

const { db, auth, FIREBASE_READY } = require('./firebase');
const { sendMail, isMailerReady } = require('./mailer');
const crypto = require('crypto');

// Invoice Themes (matching frontend)
const INV_THEMES = {
  navy: { name: 'Navy & Gold', bg: '#1B2B4B', accent: '#BF8C40', text: '#FFFFFF', sub: 'rgba(255,255,255,.5)', paper: '#FFFFFF', border: '#E5E8EE', rowbg: '#F8F9FB' },
  charcoal: { name: 'Charcoal', bg: '#1F2937', accent: '#F59E0B', text: '#FFFFFF', sub: 'rgba(255,255,255,.5)', paper: '#FFFFFF', border: '#E5E8EE', rowbg: '#F9FAFB' },
  forest: { name: 'Forest Green', bg: '#14532D', accent: '#86EFAC', text: '#FFFFFF', sub: 'rgba(255,255,255,.5)', paper: '#FFFFFF', border: '#E5E8EE', rowbg: '#F0FDF4' },
  royal: { name: 'Royal Purple', bg: '#4C1D95', accent: '#C4B5FD', text: '#FFFFFF', sub: 'rgba(255,255,255,.5)', paper: '#FFFFFF', border: '#E5E8EE', rowbg: '#F5F3FF' },
  crimson: { name: 'Crimson', bg: '#7F1D1D', accent: '#FCA5A5', text: '#FFFFFF', sub: 'rgba(255,255,255,.5)', paper: '#FFFFFF', border: '#E5E8EE', rowbg: '#FEF2F2' },
  slate: { name: 'Slate Gray', bg: '#374151', accent: '#60A5FA', text: '#FFFFFF', sub: 'rgba(255,255,255,.5)', paper: '#FFFFFF', border: '#E5E8EE', rowbg: '#F9FAFB' },
  ocean: { name: 'Ocean Blue', bg: '#1E3A5F', accent: '#38BDF8', text: '#FFFFFF', sub: 'rgba(255,255,255,.5)', paper: '#FFFFFF', border: '#EFF6FF', rowbg: '#F0F9FF' },
  minimal: { name: 'Minimal White', bg: '#F8F9FB', accent: '#1B2B4B', text: '#0F1E38', sub: '#6B7280', paper: '#FFFFFF', border: '#E5E8EE', rowbg: '#F8F9FB' }
};

// Number to Words (Indian format)
function n2w(num) {
  if (!num || isNaN(num)) return 'Zero';
  num = Math.round(num);
  if (num === 0) return 'Zero';
  const o = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function cv(n) {
    if (n < 20) return o[n];
    if (n < 100) return t[Math.floor(n / 10)] + (n % 10 ? ' ' + o[n % 10] : '');
    if (n < 1000) return o[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + cv(n % 100) : '');
    if (n < 100000) return cv(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + cv(n % 1000) : '');
    if (n < 10000000) return cv(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + cv(n % 100000) : '');
    return cv(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + cv(n % 10000000) : '');
  }
  return cv(num);
}

// Build Invoice HTML (matching frontend exactly)
function buildInvoiceHTML(snap) {
  const t = INV_THEMES[snap?.theme || 'navy'] || INV_THEMES.navy;
  const s = snap?.school || { name: 'Hoot & Howl Learning', tagline: 'Educational Excellence' };
  const fmt = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fdFmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  let sub = 0; (snap?.items || []).forEach(i => { sub += Math.max(0, (i.qty * i.rate) - (i.disc || 0)); });
  const disc = parseFloat(snap?.disc || 0), conc = parseFloat(snap?.conc_amt || 0), late = parseFloat(snap?.late || 0), taxPct = parseFloat(snap?.tax || 0);
  const after = sub - disc - conc + late, taxAmt = after * taxPct / 100, grand = Math.round(after + taxAmt), roff = grand - (after + taxAmt);
  const BLANKS = Math.max(0, 4 - (snap?.items || []).length);
  const feeRows = (snap?.items || []).map((item, index) => {
    const amt = Math.max(0, (item.qty * item.rate) - (item.disc || 0));
    return `<tr style="border-bottom:1px solid ${t.border}"><td style="padding:8px 10px;text-align:center;font-weight:700;color:#9CA3AF;font-size:11px">${String(index + 1).padStart(2, '0')}</td><td style="padding:8px 10px">${item?.desc || ''}</td><td style="padding:8px 10px;text-align:center;color:#6B7280">${item?.hsn || ''}</td><td style="padding:8px 10px;text-align:center">${item.qty}</td><td style="padding:8px 10px;text-align:right">${item.rate ? fmt(item.rate) : ''}</td><td style="padding:8px 10px;text-align:right">${item.disc ? '-' + fmt(item.disc) : '—'}</td><td style="padding:8px 10px;text-align:right;font-weight:700">${amt ? fmt(amt) : ''}</td></tr>`;
  }).join('') + Array(BLANKS).fill(`<tr style="border-bottom:1px solid ${t.border}"><td style="padding:8px 10px">&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  const totalAdjRows = (disc ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:#6B7280">Discount</span><span style="font-weight:600">-${fmt(disc)}</span></div>` : '')
    + (conc ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:#6B7280">Scholarship${snap?.concession ? ` (${snap.concession})` : ''}</span><span style="font-weight:600">-${fmt(conc)}</span></div>` : '')
    + (late ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:#6B7280">Late Fee</span><span style="font-weight:600">+${fmt(late)}</span></div>` : '')
    + (taxPct ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:#6B7280">GST ${taxPct}%</span><span style="font-weight:600">${fmt(taxAmt)}</span></div>` : '')
    + (Math.abs(roff) > 0.005 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:#6B7280">Round Off</span><span style="font-weight:600">${roff >= 0 ? '+' : ''}${fmt(Math.abs(roff))}</span></div>` : '');
  const invTitle = snap?.mode === 'receipt' ? 'RECEIPT' : snap?.mode === 'estimate' ? 'ESTIMATE' : 'INVOICE';
  const partyMeta = [snap?.sroll ? `Roll No: ${snap.sroll}` : '', snap?.sclass ? `Class: ${snap.sclass}${snap?.ssec ? ` (${snap.ssec})` : ''}` : '', snap?.sparent ? `Parent: ${snap.sparent}` : '', snap?.smob || ''].filter(Boolean).join('<br>');
  const schMeta = [s.phone, s.email, s.web, s.addr].filter(Boolean).join('<br>');
  const bankBlk = [s.bank, s.accname ? `A/c Name: ${s.accname}` : '', s.acc ? `A/c No: ${s.acc}` : '', s.ifsc ? `IFSC: ${s.ifsc}` : '', s.upi ? `UPI: ${s.upi}` : ''].filter(Boolean).join('<br>');
  const stampStyle = snap?.payStatus === 'paid' ? 'color:#15803D' : snap?.payStatus === 'overdue' ? 'color:#DC2626' : 'color:#9CA3AF';
  const stampText = snap?.payStatus && snap.payStatus !== 'pending' ? snap.payStatus.toUpperCase() : '';
  const sigHTML = snap?.sig ? `<img src="${snap.sig}" style="max-height:36px;max-width:90px;object-fit:contain;display:block;margin:0 auto">` : '';
  const qrHTML = s.showqr && s.qr ? `<div style="text-align:center;margin-top:8px"><img src="${s.qr}" style="width:64px;height:64px;object-fit:contain"><div style="font-size:8px;color:#9CA3AF;margin-top:2px">Scan to Pay</div></div>` : '';
  const noteHTML = snap?.invnote ? `<div style="background:#FFFBEB;border-left:3px solid #F59E0B;padding:5px 12px;margin:0 0 0;font-size:9.5px;color:#D97706;font-style:italic">${snap.invnote}</div>` : '';
  const wmHTML = snap?.wm ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:48px;font-weight:900;opacity:.04;color:#000;pointer-events:none;letter-spacing:4px;z-index:0">${snap.wm}</div>` : '';
  // School logo path
  const logoPath = path.join(__dirname, '../logo.png');
  const logoBase64 = fs.existsSync(logoPath) ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}` : '';
  
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,300;400;600;700&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Plus Jakarta Sans',system-ui,sans-serif; }
    </style>
  </head>
  <body>
    <div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;color:#0F1E38;background:#fff;position:relative;overflow:hidden">
      ${wmHTML}
      <div style="background:${t.bg};padding:22px 24px 18px;display:flex;justify-content:space-between;align-items:flex-start">
        ${logoBase64 
          ? `<div><img src="${logoBase64}" style="max-height:44px;max-width:130px;object-fit:contain;display:block"><div style="font-size:9px;color:${t.sub};margin-top:4px">${s.tagline || 'Educational Excellence'}</div></div>`
          : `<div><div style="font-size:22px;font-weight:800;color:${t.text};letter-spacing:-.3px">${s.name || 'Hoot & Howl Learning'}</div><div style="font-size:9.5px;color:${t.sub};margin-top:1px">${s.tagline || ''}</div></div>`
        }
        <div style="text-align:right">
          <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${t.sub}">${invTitle}</div>
          <div style="font-size:16px;font-weight:800;color:${t.accent};margin-top:2px;font-family:'DM Mono',monospace">${snap?.no || '—'}</div>
          <div style="font-size:13px;font-weight:700;color:${t.text};margin-top:4px">${s.name || 'Hoot & Howl Learning'}</div>
          ${stampText ? `<div style="font-size:11px;font-weight:900;letter-spacing:2px;margin-top:6px;${stampStyle}">${stampText}</div>` : ''}
        </div>
      </div>
      ${noteHTML}
      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid ${t.border}">
        <div style="padding:14px 18px">
          <div style="font-size:8px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;margin-bottom:5px">BILLED TO</div>
          <div style="font-size:13px;font-weight:700;color:#0F1E38">${snap?.sname || 'Student Name'}</div>
          <div style="font-size:10px;color:#6B7280;line-height:1.8;margin-top:2px">${partyMeta}</div>
        </div>
        <div style="padding:14px 18px;border-left:1px solid ${t.border}">
          <div style="font-size:8px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;margin-bottom:5px">FROM</div>
          <div style="font-size:13px;font-weight:700;color:#0F1E38">${s.name || 'Hoot & Howl Learning'}</div>
          <div style="font-size:10px;color:#6B7280;line-height:1.8;margin-top:2px">${schMeta}</div>
        </div>
      </div>
      <div style="background:${t.rowbg};padding:8px 18px;display:flex;gap:20px;border-bottom:1px solid ${t.border};flex-wrap:wrap">
        ${[['DATE', fdFmt(snap?.date)], ['DUE DATE', snap?.due && snap?.mode !== 'receipt' ? fdFmt(snap.due) : '—'], ['FOR PERIOD', snap?.month || snap?.year || '—'], ['PAYMENT', snap?.paymethod || 'Cash'], snap?.ref ? ['REF', snap.ref] : null].filter(Boolean).map(([lbl, val]) => `<div style="padding:4px 0"><div style="font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#9CA3AF">${lbl}</div><div style="font-size:11px;font-weight:700;color:#0F1E38;margin-top:1px">${val}</div></div>`).join('')}
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:${t.rowbg};border-bottom:1.5px solid ${t.border}">
          ${['#','Description','HSN','QTY','Rate (₹)','Disc. (₹)','Amount (₹)'].map((h,i) => `<th style="padding:7px 10px;font-size:8px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${t.bg};text-align:${i===1?'left':i===0?'center':'right'}">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${feeRows}</tbody>
      </table>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid ${t.border}">
        <div style="padding:14px 18px">
          <div style="font-size:8px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0F1E38;margin-bottom:6px">PAYMENT DETAILS</div>
          <div style="font-size:9.5px;color:#6B7280;line-height:1.9">${bankBlk || '—'}</div>
          ${qrHTML}
          ${s.terms ? `<div style="margin-top:8px"><div style="font-size:8px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0F1E38;margin-bottom:3px">TERMS & CONDITIONS</div><div style="font-size:9px;color:#6B7280;line-height:1.6">${s.terms}</div></div>` : ''}
        </div>
        <div style="padding:14px 18px;border-left:1px solid ${t.border}">
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px"><span style="color:#6B7280">Subtotal</span><span style="font-weight:600">${fmt(sub)}</span></div>
          ${totalAdjRows}
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 4px;border-top:2px solid ${t.bg};margin-top:6px">
            <span style="font-weight:800;font-size:12px">TOTAL DUE</span>
            <span style="font-size:20px;font-weight:800;color:${t.bg}">${fmt(grand)}</span>
          </div>
          <div style="font-size:9px;font-style:italic;color:#6B7280;text-align:right">${n2w(grand)} Rupees Only</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:12px 18px;border-top:1px solid ${t.border};background:${t.rowbg}">
        <div style="font-size:9.5px;color:#6B7280;max-width:55%">${s.footer_note || 'Thank you for your payment. Please retain this receipt for your records.'}</div>
        <div style="text-align:center">
          ${sigHTML ? `<div style="min-height:36px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:4px">${sigHTML}</div>` : `<div style="height:32px"></div>`}
          <div style="width:100px;border-bottom:1.5px solid ${t.bg};margin:0 auto 3px"></div>
          <div style="font-size:9px;color:#6B7280">Authorized Signatory</div>
          <div style="font-size:9px;font-weight:700;color:${t.bg}">${s.principal || s.name || ''}</div>
        </div>
      </div>
      <div style="background:${t.bg};padding:5px 18px;display:flex;gap:14px">
        ${[s.phone, s.email, s.web].filter(Boolean).map(v => `<span style="font-size:9px;color:${t.sub}">${v}</span>`).join('')}
      </div>
    </div>
  </body>
  </html>`;
}

// Generate Invoice PDF using Puppeteer (exact match to frontend)
async function generateInvoicePDF(invoice) {
  // Prepare the snap data
  const snap = {
    ...(invoice.snap || {}),
    no: invoice.snap?.no || invoice.no,
    date: invoice.snap?.date || invoice.date,
    sname: invoice.snap?.sname || invoice.sname,
    sclass: invoice.snap?.sclass || invoice.sclass,
    month: invoice.snap?.month || invoice.month,
    items: invoice.snap?.items || [],
    school: invoice.snap?.school || { name: 'Hoot & Howl Learning', tagline: 'Educational Excellence' }
  };
  
  // If no items, add a default tuition item
  if (!snap.items || snap.items.length === 0) {
    snap.items = [{
      desc: `Tuition Fee - ${invoice.month || ''}`,
      qty: 1,
      rate: invoice.grand,
      disc: 0,
      amount: invoice.grand
    }];
  }
  
  // Generate HTML
  const html = buildInvoiceHTML(snap);
  
  // Launch Puppeteer and generate PDF
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    printBackground: true
  });
  
  await browser.close();
  
  return pdfBuffer;
}

// JSON DB functions
function getJsonDb() {
  const dbPath = path.join(__dirname, 'db.json');
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ students: [], invoices: [], attendance: {} }, null, 2), 'utf-8');
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}
function saveJsonDb(data) {
  const dbPath = path.join(__dirname, 'db.json');
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}



// Verify Firebase Auth ID token and get admin data from Firestore
async function verifySession(req) {
  if (!FIREBASE_READY || !auth || !db) {
    console.warn("⚠️ Firebase not initialized, falling back to demo mode");
    // Fallback to demo mode if Firebase not available
    const token = req.headers['x-admin-token'];
    if (token) {
      // Demo token handling (for compatibility)
      if (token === 'demo-admin1') return { username: 'admin1', branch: 'branch1', name: 'Branch 1 Admin', isSuper: false };
      if (token === 'demo-admin2') return { username: 'admin2', branch: 'branch2', name: 'Branch 2 Admin', isSuper: false };
      if (token === 'demo-super') return { username: 'super', branch: 'super', name: 'Super Admin', isSuper: true };
    }
    return null;
  }

  const idToken = req.headers['authorization']?.split('Bearer ')[1];
  if (!idToken) {
    console.warn("⚠️ No ID token found in request headers");
    return null;
  }

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    console.log(`[VerifySession] Verifying admin with UID: ${uid}`);
    
    const adminDoc = await db.collection('admins').doc(uid).get();
    if (!adminDoc.exists) {
      console.error(`[VerifySession] Admin document not found for UID: ${uid}`);
      return null;
    }
    
    const adminData = adminDoc.data();
    console.log(`[VerifySession] Admin data loaded from Firestore:`, {
      uid,
      email: decodedToken.email,
      branch: adminData.branch,
      isSuper: adminData.isSuper
    });
    
    return {
      username: decodedToken.email,
      branch: adminData.branch,
      name: adminData.name || decodedToken.email,
      isSuper: adminData.isSuper || false,
      uid: uid
    };
  } catch (error) {
    console.error("❌ Error verifying Firebase ID token:", error);
    return null;
  }
}

// Helper to get branch-specific paths (with super admin can override)
function getCollectionsForAdmin(admin, requestedBranch = null) {
  let branch;
  if (admin.isSuper) {
    // Super admin can use requested branch, otherwise their assigned branch or default to branch1
    branch = requestedBranch || admin.branch;
    if (branch === 'super') {
      branch = 'branch1';
    }
  } else {
    // Normal admin can ONLY use their assigned branch, ignore any requestedBranch
    branch = admin.branch;
  }
  
  // Validate branch is one of allowed values
  const allowedBranches = ['branch1', 'branch2'];
  if (!allowedBranches.includes(branch)) {
    branch = 'branch1'; // Fallback
  }
  
  // Return subcollection paths (must have odd number of components: branch/data/students)
  return {
    branch,
    students: `${branch}/data/students`,
    invoices: `${branch}/data/invoices`,
    attendance: `${branch}/data/attendance`,
    feeCategories: `${branch}/data/feeCategories`,
    school: `${branch}/data/school`,
    timetable: `${branch}/data/timetable`,
    expenses: `${branch}/data/expenses`
  };
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the project root (index.html, logo.png, etc.)
app.use(express.static(path.join(__dirname, '..')));

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

function apiOk(res, data) { res.status(200).json({ ok: true, data }); }
function apiError(res, message, code = 500) { res.status(code).json({ ok: false, error: message }); }

// TEMPORARY SETUP ENDPOINT - Run once to create initial super admin
app.post('/api/setup', async (req, res) => {
  try {
    if (FIREBASE_READY) {
      // Check if any admins exist
      const adminSnapshot = await db.collection('admins').get();
      if (!adminSnapshot.empty) {
        return apiError(res, 'Admins already exist!', 400);
      }

      // Create super admin
      const email = 'admin@school.edu.in';
      const password = 'admin123';
      const name = 'Super Admin';
      const branch = 'branch1';
      const isSuper = true;

      const userRecord = await auth.createUser({ email, password, displayName: name });
      await db.collection('admins').doc(userRecord.uid).set({
        email,
        name,
        branch,
        isSuper,
        createdAt: new Date().toISOString(),
        uid: userRecord.uid
      });

      apiOk(res, { message: 'Super admin created!', email, password });
    } else {
      apiError(res, 'Firebase not initialized!', 503);
    }
  } catch (err) {
    console.error('[SETUP] Error:', err);
    apiError(res, err.message);
  }
});

function ensureFirebase(res) {
  if (!FIREBASE_READY || !db) { apiError(res, 'Firebase not initialized. Provide serviceAccountKey.json and FIREBASE_PROJECT_ID in /server/.env.', 503); return false; }
  return true;
}
function ensureMailer(res) {
  if (!isMailerReady) { apiError(res, 'Mailer not configured. Set SMTP_USER and SMTP_PASS in /server/.env.', 503); return false; }
  return true;
}

async function sendParentEmail(type, student, payload = {}) {
  console.log('=================================================');
  console.log(`[sendParentEmail] START! Type: ${type}`);
  console.log('[sendParentEmail] Student object:', JSON.stringify(student, null, 2));
  console.log('[sendParentEmail] Payload:', JSON.stringify(payload, null, 2));
  console.log('[sendParentEmail] isMailerReady:', isMailerReady);
  
  if (!isMailerReady) {
    console.error('[sendParentEmail] ❌ ERROR: Mailer not initialized!');
    console.error('[sendParentEmail] Check SMTP_USER and SMTP_PASS in environment variables!');
    return;
  }
  
  const to = student.parentEmail || student.email;
  console.log(`[sendParentEmail] Found recipient email:`, to);
  console.log(`[sendParentEmail] student.parentEmail:`, student.parentEmail);
  console.log(`[sendParentEmail] student.email:`, student.email);
  
  if (!to) {
    console.warn(`[sendParentEmail] ⚠️ SKIPPED: No email address for student!`);
    console.warn(`[sendParentEmail] Student name:`, student.name);
    console.warn(`[sendParentEmail] Student ID:`, student.id);
    return;
  }

  // Helper function to format date as DD-MM-YYYY
  function formatDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('-')) {
      // If format is YYYY-MM-DD
      const [year, month, day] = dateStr.split('-');
      return `${day}-${month}-${year}`;
    } else if (dateStr.includes('/')) {
      // If format is DD/MM/YYYY or MM/DD/YYYY
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts.length === 3 ? (parts[0].length <= 2 && parts[1].length <=2 && parts[2].length ===4 ? parts : (parts[2].length ===4 ? [parts[1], parts[0], parts[2]] : parts)) : parts;
        return `${d}-${m}-${y}`;
      }
    }
    return dateStr;
  }

  let subject = '', html = '', attachments = [];
  switch (type) {
    case 'absent':
      let absentDate = formatDate(payload.date);
      if (!absentDate) {
        // Fallback to current date in DD-MM-YYYY
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        absentDate = `${day}-${month}-${year}`;
      }
      subject = `Attendance Alert: ${student.name} marked absent on ${absentDate}`;
      html = `<p>Dear Parent,</p>
              <p>This is to inform you that your child <strong>${student.name}</strong> was marked <strong>ABSENT</strong> on <strong>${absentDate}</strong>.</p>
              <p>Please ensure regular attendance.</p>
              <p>Regards,<br/>Hoot & Howl Learning</p>`;
      break;
    case 'invoice': // For paid invoices
      subject = `Invoice for ${student.name} – ${payload.month || 'Monthly'}`;
      const formattedDueInvoice = formatDate(payload.dueDate);
      html = `<p>Dear Parent,</p>
              <p>Thank you for the payment! An invoice has been generated for <strong>${student.name}</strong>.</p>
              <p><strong>Student Name:</strong> ${student.name}<br/>
              <strong>Class:</strong> ${student.cls || payload.class || '—'}<br/>
              <strong>Month:</strong> ${payload.month || '—'}<br/>
              <strong>Amount Paid:</strong> ${payload.total}<br/>
              <strong>Invoice Number:</strong> ${payload.id}</p>
              ${formattedDueInvoice ? `<p>Due Date: <strong>${formattedDueInvoice}</strong></p>` : ''}
              <p>Please find the attached invoice PDF for your records.</p>
              <p>Regards,<br/>Hoot & Howl Learning</p>`;
      if (payload.pdfBuffer) {
        attachments = [{
          filename: `invoice-${payload.id}.pdf`,
          content: payload.pdfBuffer
        }];
      }
      break;
    case 'pending':
      subject = `Fee Reminder for ${student.name} – ${payload.month || 'Monthly'}`;
      const formattedDuePending = formatDate(payload.dueDate);
      html = `<p>Dear Parent,</p>
              <p>This is a friendly reminder that a fee invoice has been generated for <strong>${student.name}</strong>.</p>
              <p><strong>Student Name:</strong> ${student.name}<br/>
              <strong>Class:</strong> ${student.cls || payload.class || '—'}<br/>
              <strong>Month:</strong> ${payload.month || '—'}<br/>
              <strong>Amount Due:</strong> ${payload.total}<br/>
              <strong>Invoice Number:</strong> ${payload.id}</p>
              ${formattedDuePending ? `<p>Due Date: <strong>${formattedDuePending}</strong></p>` : ''}
              <p>Please make the payment on time as soon as possible to avoid any inconvenience.</p>
              <p>Regards,<br/>Hoot & Howl Learning</p>`;
      break;
    case 'overdue':
      subject = `Fee Overdue Notice for ${student.name}`;
      const formattedDueOverdue = formatDate(payload.dueDate);
      html = `<p>Dear Parent,</p>
              <p>The fee for <strong>${student.name}</strong> is <strong>OVERDUE</strong>.</p>
              <p><strong>Student Name:</strong> ${student.name}<br/>
              <strong>Class:</strong> ${student.cls || payload.class || '—'}<br/>
              <strong>Month:</strong> ${payload.month || '—'}<br/>
              <strong>Amount Due:</strong> ${payload.total}<br/>
              <strong>Invoice Number:</strong> ${payload.id}</p>
              ${formattedDueOverdue ? `<p>Due Date: <strong>${formattedDueOverdue}</strong></p>` : ''}
              <p>Please make the payment at the earliest.</p>
              <p>Regards,<br/>Hoot & Howl Learning</p>`;
      break;
    default:
      subject = `Notification for ${student.name}`;
      html = `<p>Dear Parent,</p><p>There is an update regarding ${student.name}.</p>`;
  }
  console.log(`[sendParentEmail] Sending email to ${to} with subject: ${subject}`);
  try {
    const result = await sendMail({ to, subject, html, text: subject, attachments });
    console.log(`[sendParentEmail] ✅ SUCCESS: Email sent!`);
    console.log(`[sendParentEmail] Send result:`, result);
  } catch (err) {
    console.error(`[sendParentEmail] ❌ ERROR: Failed to send email!`);
    console.error(`[sendParentEmail] Error message:`, err.message);
    console.error(`[sendParentEmail] Full error:`, err);
    if (err.stack) console.error(`[sendParentEmail] Stack trace:`, err.stack);
  }
}



app.get('/api/health', (req, res) => {
  apiOk(res, { firebase: FIREBASE_READY, mailer: isMailerReady, time: new Date().toISOString() });
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
  try {
    if (!isMailerReady) return apiError(res, 'Mailer not configured!', 503);
    const { to } = req.body;
    if (!to) return apiError(res, 'Missing "to" email!', 400);
    await sendMail({
      to,
      subject: 'Test Email from Hoot & Howl',
      html: '<p>This is a test email! 🎉</p>',
      text: 'This is a test email!'
    });
    apiOk(res, { message: 'Email sent successfully!' });
  } catch (err) {
    console.error('[Test Email] Error:', err);
    apiError(res, err.message);
  }
});

// Admin Login (now just for demo compatibility; frontend uses Firebase Auth directly)
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return apiError(res, 'Username and password required', 400);

    // Fallback for demo mode
    const demoAdmins = {
      'admin1': { password: 'admin123', branch: 'branch1', name: 'Branch 1 Admin' },
      'admin2': { password: 'admin123', branch: 'branch2', name: 'Branch 2 Admin' },
      'super': { password: 'super123', branch: 'super', name: 'Super Admin' }
    };
    if (!demoAdmins[username]) return apiError(res, 'Admin not found', 404);
    const admin = demoAdmins[username];
    if (admin.password !== password) return apiError(res, 'Invalid password', 401);

    apiOk(res, { token: `demo-${username}`, branch: admin.branch, name: admin.name, isSuper: admin.branch === 'super' });
  } catch (err) { apiError(res, err.message); }
});

// Get current admin session
app.get('/api/admin/session', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    apiOk(res, session);
  } catch (err) { apiError(res, err.message); }
});

// Switch branch (for super admin only)
app.post('/api/admin/switch-branch', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    if (!session.isSuper) return apiError(res, 'Not allowed', 403);

    const { branch } = req.body;
    if (!branch) return apiError(res, 'Branch required', 400);
    
    // Verify the branch is valid
    const validBranches = ['branch1', 'branch2'];
    if (!validBranches.includes(branch)) return apiError(res, 'Invalid branch', 400);
    
    apiOk(res, { ...session, branch });
  } catch (err) { apiError(res, err.message); }
});

// Admin Management Endpoints

// Create Admin
app.post('/api/admin/create', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);

    const { email, password, name, branch: targetBranch, isSuper } = req.body;
    if (!email || !password || !name || !targetBranch) {
      return apiError(res, 'Missing required fields (email, password, name, branch)', 400);
    }

    // Check permissions:
    // - Super admin can create any admin (any branch, including super)
    // - Normal admin can only create admins in their own branch (and can't create supers)
    if (!session.isSuper) {
      if (isSuper) return apiError(res, 'Only super admins can create other super admins', 403);
      if (targetBranch !== session.branch) return apiError(res, 'You can only create admins for your own branch', 403);
    }

    const adminData = {
      email,
      name,
      branch: targetBranch,
      isSuper: Boolean(isSuper),
      createdAt: new Date().toISOString()
    };

    if (FIREBASE_READY) {
      // Create Firebase Auth user first
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: name
      });

      // Save admin data to Firestore (using user's UID as doc ID)
      await db.collection('admins').doc(userRecord.uid).set({
        ...adminData,
        uid: userRecord.uid
      });

      apiOk(res, { ...adminData, id: userRecord.uid, uid: userRecord.uid });
    } else {
      // Demo mode (JSON DB): just store in memory/JSON
      const data = getJsonDb();
      if (!data.admins) data.admins = [];
      
      const newId = crypto.randomBytes(16).toString('hex');
      const newAdmin = { ...adminData, id: newId, uid: newId };
      data.admins.push(newAdmin);
      saveJsonDb(data);
      
      apiOk(res, newAdmin);
    }
  } catch (err) {
    console.error('[POST /api/admin/create] Error:', err);
    apiError(res, err.message);
  }
});

// List Admins
app.get('/api/admin/list', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);

    let admins = [];
    if (FIREBASE_READY) {
      const snapshot = await db.collection('admins').get();
      admins = snapshot.docs.map(doc => ({ id: doc.id, uid: doc.id, ...doc.data() }));
    } else {
      const data = getJsonDb();
      admins = data.admins || [];
    }

    // Filter admins based on permissions:
    // - Super admin sees all
    // - Normal admin only sees admins in their own branch
    if (!session.isSuper) {
      admins = admins.filter(a => a.branch === session.branch);
    }

    apiOk(res, admins);
  } catch (err) {
    console.error('[GET /api/admin/list] Error:', err);
    apiError(res, err.message);
  }
});

// Update Admin
app.put('/api/admin/:id', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);

    const adminId = req.params.id;
    const { name, branch: targetBranch, isSuper, password } = req.body;

    if (FIREBASE_READY) {
      const adminDoc = await db.collection('admins').doc(adminId).get();
      if (!adminDoc.exists) return apiError(res, 'Admin not found', 404);
      
      const existingAdmin = adminDoc.data();

      // Check permissions
      if (!session.isSuper) {
        // Can only update admins in their own branch
        if (existingAdmin.branch !== session.branch) return apiError(res, 'Not allowed', 403);
        // Can't change branch or isSuper
        if (targetBranch && targetBranch !== session.branch) return apiError(res, 'Not allowed to change branch', 403);
        if (isSuper !== undefined && isSuper !== existingAdmin.isSuper) return apiError(res, 'Not allowed to change super status', 403);
      }

      // Update data
      const updateData = {};
      if (name) updateData.name = name;
      if (targetBranch) updateData.branch = targetBranch;
      if (isSuper !== undefined) updateData.isSuper = isSuper;

      await db.collection('admins').doc(adminId).update(updateData);

      // Update password if provided
      if (password) {
        await auth.updateUser(adminId, { password });
      }

      // Get updated admin
      const updatedDoc = await db.collection('admins').doc(adminId).get();
      apiOk(res, { id: updatedDoc.id, uid: updatedDoc.id, ...updatedDoc.data() });
    } else {
      const data = getJsonDb();
      if (!data.admins) data.admins = [];
      
      const existingIdx = data.admins.findIndex(a => a.id === adminId);
      if (existingIdx === -1) return apiError(res, 'Admin not found', 404);
      
      const existingAdmin = data.admins[existingIdx];

      // Check permissions
      if (!session.isSuper) {
        if (existingAdmin.branch !== session.branch) return apiError(res, 'Not allowed', 403);
        if (targetBranch && targetBranch !== session.branch) return apiError(res, 'Not allowed to change branch', 403);
        if (isSuper !== undefined && isSuper !== existingAdmin.isSuper) return apiError(res, 'Not allowed to change super status', 403);
      }

      // Update
      const updatedAdmin = { ...existingAdmin };
      if (name) updatedAdmin.name = name;
      if (targetBranch) updatedAdmin.branch = targetBranch;
      if (isSuper !== undefined) updatedAdmin.isSuper = isSuper;
      
      data.admins[existingIdx] = updatedAdmin;
      saveJsonDb(data);
      
      apiOk(res, updatedAdmin);
    }
  } catch (err) {
    console.error('[PUT /api/admin/:id] Error:', err);
    apiError(res, err.message);
  }
});

// Delete Admin
app.delete('/api/admin/:id', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);

    const adminId = req.params.id;

    // Prevent deleting self!
    if (FIREBASE_READY && session.uid === adminId) return apiError(res, 'Cannot delete your own account', 400);
    if (!FIREBASE_READY && session.id === adminId) return apiError(res, 'Cannot delete your own account', 400);

    if (FIREBASE_READY) {
      const adminDoc = await db.collection('admins').doc(adminId).get();
      if (!adminDoc.exists) return apiError(res, 'Admin not found', 404);
      
      const existingAdmin = adminDoc.data();

      // Check permissions
      if (!session.isSuper && existingAdmin.branch !== session.branch) return apiError(res, 'Not allowed', 403);
      if (!session.isSuper && existingAdmin.isSuper) return apiError(res, 'Not allowed to delete super admins', 403);

      // Delete from Firebase Auth and Firestore
      await auth.deleteUser(adminId);
      await db.collection('admins').doc(adminId).delete();
    } else {
      const data = getJsonDb();
      if (!data.admins) data.admins = [];
      
      const existingIdx = data.admins.findIndex(a => a.id === adminId);
      if (existingIdx === -1) return apiError(res, 'Admin not found', 404);
      
      const existingAdmin = data.admins[existingIdx];

      // Check permissions
      if (!session.isSuper && existingAdmin.branch !== session.branch) return apiError(res, 'Not allowed', 403);
      if (!session.isSuper && existingAdmin.isSuper) return apiError(res, 'Not allowed to delete super admins', 403);

      // Delete
      data.admins.splice(existingIdx, 1);
      saveJsonDb(data);
    }

    apiOk(res, { success: true });
  } catch (err) {
    console.error('[DELETE /api/admin/:id] Error:', err);
    apiError(res, err.message);
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const student = req.body || {};
    console.log('[POST /api/students] Received student:', JSON.stringify(student, null, 2));
    if (!student.name) return apiError(res, 'Missing student.name', 400);
    
    const studentData = { ...student };
    const newDocId = student.name.trim(); 
    const oldDocId = student.id ? String(student.id).trim() : null;
    delete studentData.id;
    
    let isNewStudent = false;

    if (FIREBASE_READY) {
      // Check if student already exists
      const existingDoc = await db.collection(collections.students).doc(newDocId).get();
      isNewStudent = !existingDoc.exists;
      
      if (oldDocId && oldDocId !== newDocId) {
        console.log('[POST /api/students] Name changed! Deleting old doc:', oldDocId);
        await db.collection(collections.students).doc(oldDocId).delete();
      }
      
      // If new student, auto-generate admission/roll number
      if (isNewStudent) {
        // Get all students to find the highest admission number
        const allStudentsSnapshot = await db.collection(collections.students).get();
        let maxNumber = 0;
        
        allStudentsSnapshot.forEach(doc => {
          const admNo = doc.data().admno || '';
          const match = admNo.match(/H&HLSTU(\d+)/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNumber) maxNumber = num;
          }
        });
        
        const newNumber = maxNumber + 1;
        const newAdmNo = `H&HLSTU${String(newNumber).padStart(3, '0')}`;
        studentData.admno = newAdmNo;
        studentData.roll = newAdmNo; // Set roll number same as admission number
      }
      
      await db.collection(collections.students).doc(newDocId).set(studentData, { merge: true });
      const doc = await db.collection(collections.students).doc(newDocId).get();
      const saved = { ...(doc.exists ? doc.data() : studentData), id: newDocId };
      console.log('[POST /api/students] Saved student with name as doc ID:', JSON.stringify(saved, null, 2));
      apiOk(res, saved);
    } else {
      // Use JSON DB
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) {
        data[branch] = { students: [], invoices: [], attendance: {} };
      }
      const branchData = data[branch];
      
      // Check if student already exists
      const existingIdx = branchData.students.findIndex(s => s.id === newDocId);
      isNewStudent = existingIdx === -1;
      
      if (oldDocId && oldDocId !== newDocId) {
        branchData.students = branchData.students.filter(s => s.id !== oldDocId);
      }
      
      // If new student, auto-generate admission/roll number
      if (isNewStudent) {
        // Get all students to find the highest admission number
        let maxNumber = 0;
        branchData.students.forEach(s => {
          const admNo = s.admno || '';
          const match = admNo.match(/H&HLSTU(\d+)/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNumber) maxNumber = num;
          }
        });
        
        const newNumber = maxNumber + 1;
        const newAdmNo = `H&HLSTU${String(newNumber).padStart(3, '0')}`;
        studentData.admno = newAdmNo;
        studentData.roll = newAdmNo; // Set roll number same as admission number
      }
      
      if (existingIdx !== -1) {
        branchData.students[existingIdx] = { ...branchData.students[existingIdx], ...studentData, id: newDocId };
      } else {
        branchData.students.push({ ...studentData, id: newDocId });
      }
      saveJsonDb(data);
      const saved = branchData.students.find(s => s.id === newDocId);
      apiOk(res, saved);
    }
  } catch (err) { 
    console.error('[POST /api/students] Error:', err);
    apiError(res, err.message); 
  }
});

app.get('/api/students', async (req, res) => {
  try {
    const session = await verifySession(req);
    console.log('[GET /api/students] Session:', session ? 'Valid' : 'Invalid');
    if (!session) return apiError(res, 'Unauthorized', 401);
    
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    console.log('[GET /api/students] Collections:', collections);
    
    if (FIREBASE_READY) {
      console.log('[GET /api/students] Fetching from Firestore at path:', collections.students);
      const snapshot = await db.collection(collections.students).get();
      console.log('[GET /api/students] Found', snapshot.size, 'documents!');
      const list = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      console.log('[GET /api/students] Students data:', list);
      apiOk(res, list);
    } else {
      // Use JSON DB
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      apiOk(res, data[branch].students);
    }
  } catch (err) {
    console.error('[GET /api/students] Error:', err);
    apiError(res, err.message);
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const { id } = req.params;
    if (!id) return apiError(res, 'Missing id', 400);
    console.log('[DELETE /api/students] requested id (student name):', id);
    
    if (FIREBASE_READY) {
      await db.collection(collections.students).doc(String(id)).delete();
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      data[branch].students = data[branch].students.filter(s => s.id !== id);
      saveJsonDb(data);
    }
    console.log('[DELETE /api/students] success:', id);
    apiOk(res, { id });
  } catch (err) { apiError(res, err.message); }
});

app.post('/api/send-email', async (req, res) => {
  try {
    if (!ensureMailer(res)) return;
    const { to, subject, html, text } = req.body || {};
    if (!to || !subject) return apiError(res, 'Missing to/subject', 400);
    const info = await sendMail({ to, subject, html, text });
    apiOk(res, { messageId: info.messageId });
  } catch (err) { apiError(res, err.message); }
});

app.get('/api/invoices', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    if (FIREBASE_READY) {
      console.log('[GET /api/invoices] Fetching all invoices from Firestore...');
      const snapshot = await db.collection(collections.invoices).get();
      console.log('[GET /api/invoices] Found', snapshot.size, 'invoices in Firestore');
      const list = snapshot.docs.map(d => {
        const data = d.data();
        console.log('[GET /api/invoices] Invoice doc ID:', d.id, 'no:', data.no, 'sname:', data.sname);
        return { ...data, id: d.id };
      });
      apiOk(res, list);
    } else {
      // Use JSON DB
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      apiOk(res, data[branch].invoices);
    }
  } catch (err) { 
    console.error('[GET /api/invoices] Error:', err);
    apiError(res, err.message); 
  }
});

app.post('/api/invoice', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const body = req.body || {};
    const invoiceId = body.id || body.invoiceId;
    
    if (!body.sname) return apiError(res, 'Missing student name', 400);
    if (!body.grand && body.grand !== 0) return apiError(res, 'Missing grand total', 400);

    console.log(`[POST /api/invoice] Full request body:`, JSON.stringify(body, null, 2));

    let invoiceData, isNew, invoiceNumber;
    if (FIREBASE_READY) {
      // First, generate invoice number
      if (!body.no) {
        const lastInvSnapshot = await db.collection(collections.invoices).orderBy('no', 'desc').limit(1).get();
        let lastNumber = 0;
        if (!lastInvSnapshot.empty) {
          const lastInv = lastInvSnapshot.docs[0].data();
          const lastNoStr = (lastInv.no || 'INV-0000');
          const lastNoMatch = lastNoStr.match(/-(\d+)$/);
          if (lastNoMatch) lastNumber = parseInt(lastNoMatch[1]);
        }
        const prefix = body.snap?.prefix || 'INV';
        invoiceNumber = `${prefix}-${String(lastNumber + 1).padStart(4, '0')}`;
      } else {
        invoiceNumber = body.no;
      }

      // Use invoice number as document ID
      const invDocRef = db.collection(collections.invoices).doc(String(invoiceNumber));
      const invDoc = await invDocRef.get();
      isNew = !invDoc.exists;

      invoiceData = {
        ...body,
        id: invoiceNumber, // Also store in id field for consistency
        no: invoiceNumber,
        snap: {
          ...(body.snap || {}),
          no: invoiceNumber
        },
        updatedAt: new Date().toISOString()
      };
      invoiceData.date = invoiceData.date || new Date().toISOString().split('T')[0];
      invoiceData.sname = invoiceData.sname || 'Unknown';
      invoiceData.sclass = invoiceData.sclass || '—';
      invoiceData.month = invoiceData.month || '';
      invoiceData.grand = invoiceData.grand || 0;
      invoiceData.status = invoiceData.status || 'pending';
      invoiceData.snap = invoiceData.snap || {};
      if (isNew) invoiceData.createdAt = invoiceData.updatedAt;

      await invDocRef.set(invoiceData, { merge: true });
    } else {
      // Use JSON DB
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      const branchData = data[branch];
      const existingIdx = branchData.invoices.findIndex(i => i.id === invoiceId);
      isNew = existingIdx === -1;
      
      let invoiceNumber;
      if (isNew || !body.no) {
        const lastInv = branchData.invoices[branchData.invoices.length - 1];
        let lastNumber = 0;
        if (lastInv) {
          const lastNoStr = (lastInv.no || 'INV-0000');
          const lastNoMatch = lastNoStr.match(/-(\d+)$/);
          if (lastNoMatch) lastNumber = parseInt(lastNoMatch[1]);
        }
        const prefix = body.snap?.prefix || 'INV';
        invoiceNumber = `${prefix}-${String(lastNumber + 1).padStart(4, '0')}`;
      } else {
        invoiceNumber = body.no;
      }

      invoiceData = {
        ...body,
        no: invoiceNumber,
        snap: {
          ...(body.snap || {}),
          no: invoiceNumber
        },
        updatedAt: new Date().toISOString()
      };
      invoiceData.date = invoiceData.date || new Date().toISOString().split('T')[0];
      invoiceData.sname = invoiceData.sname || 'Unknown';
      invoiceData.sclass = invoiceData.sclass || '—';
      invoiceData.month = invoiceData.month || '';
      invoiceData.grand = invoiceData.grand || 0;
      invoiceData.status = invoiceData.status || 'pending';
      invoiceData.snap = invoiceData.snap || {};
      if (isNew) invoiceData.createdAt = invoiceData.updatedAt;

      if (isNew) {
        branchData.invoices.push({ ...invoiceData, id: invoiceId });
      } else {
        branchData.invoices[existingIdx] = { ...branchData.invoices[existingIdx], ...invoiceData, id: invoiceId };
      }
      saveJsonDb(data);
    }

    console.log(`[POST /api/invoice] Success: ${invoiceId} (New: ${isNew})`);

    // Email logic
    console.log(`[POST /api/invoice] Checking email conditions: isNew=${isNew}, isMailerReady=${isMailerReady}`);
    let emailSent = false;
    if (isMailerReady) {
      try {
        let student = { name: invoiceData.sname, email: body.snap?.email };
        if (FIREBASE_READY) {
          console.log(`[POST /api/invoice] Looking up student by name: ${invoiceData.sname}`);
          const q = await db.collection(collections.students).where('name', '==', invoiceData.sname).limit(1).get();
          if (!q.empty) {
            const sDoc = q.docs[0];
            student = { id: sDoc.id, ...sDoc.data() };
          }
        } else {
          const data = getJsonDb();
          const branch = collections.branch;
          if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
          const found = data[branch].students.find(s => s.name === invoiceData.sname);
          if (found) student = found;
        }

        let pdfBuffer = null;
        let emailType = 'invoice';
        let emailPayload = {
          id: invoiceNumber || invoiceId, 
          total: invoiceData.grand.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }), 
          dueDate: invoiceData.snap?.due,
          month: invoiceData.month
        };
        
        // Only attach PDF for paid invoices
        if (invoiceData.status === 'paid') {
          pdfBuffer = await generateInvoicePDF(invoiceData);
          emailPayload.pdfBuffer = pdfBuffer;
        } else if (invoiceData.status === 'overdue') {
          emailType = 'overdue';
        } else {
          // For pending: send a reminder email (let's add a case for 'pending' in sendParentEmail)
          emailType = 'pending';
        }
        
        await sendParentEmail(emailType, student, emailPayload);
        emailSent = true;
        console.log(`[POST /api/invoice] Email sent successfully`);
      } catch (err) {
        console.error(`[POST /api/invoice] Email sync failed:`, err);
      }
    }

    const message = emailSent ? "Invoice saved and email sent successfully" : (isNew ? "Invoice saved successfully" : "Invoice updated successfully");
    apiOk(res, { id: invoiceId, message, ...invoiceData });
  } catch (err) {
    console.error(`[POST /api/invoice] Error: ${err.message}`);
    apiError(res, err.message);
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const { id } = req.params;
    if (!id || id === "undefined") {
      console.error("[DELETE /api/invoices] Delete rejected: Missing or invalid invoiceId");
      return apiError(res, 'Missing or invalid invoiceId', 400);
    }
    
    console.log(`[DELETE /api/invoices] Requested deletion for invoiceId: ${id}`);
    
    if (FIREBASE_READY) {
      const docRef = db.collection(collections.invoices).doc(String(id));
      const doc = await docRef.get();
      if (!doc.exists) {
        console.error(`[DELETE /api/invoices] Failed: Invoice ${id} does not exist`);
        return apiError(res, 'Invoice not found', 404);
      }
      await docRef.delete();
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      data[branch].invoices = data[branch].invoices.filter(i => i.id !== id);
      saveJsonDb(data);
    }

    console.log(`[DELETE /api/invoices] Success: ${id} deleted`);
    apiOk(res, { id });
  } catch (err) {
    console.error(`[DELETE /api/invoices] Error: ${err.message}`);
    apiError(res, err.message);
  }
});

app.get('/api/attendance/:date', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    const { date } = req.params;
    if (!date) return apiError(res, 'Missing date', 400);

    if (FIREBASE_READY) {
      const snapshot = await db.collection(collections.attendance).doc(date).collection('students').get();
      const records = snapshot.docs.map(d => ({ ...d.data(), studentId: d.id }));
      apiOk(res, records);
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      const attendanceDay = data[branch].attendance[date] || {};
      const records = Object.entries(attendanceDay).map(([studentId, rec]) => ({ ...rec, studentId }));
      apiOk(res, records);
    }
  } catch (err) { apiError(res, err.message); }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    const { studentId, status, date } = req.body || {};
    if (!studentId || !status) return apiError(res, 'Missing studentId/status', 400);
    
    const targetDate = date || new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    // Get student details
    let student;
    if (FIREBASE_READY) {
      const sDoc = await db.collection(collections.students).doc(String(studentId)).get();
      if (!sDoc.exists) return apiError(res, 'Student not found', 404);
      student = sDoc.data();
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      student = data[branch].students.find(s => s.id == studentId);
      if (!student) return apiError(res, 'Student not found', 404);
    }

    const record = {
      name: student.name || 'Unknown',
      class: student.cls || '—',
      status,
      time,
      date: targetDate
    };

    if (FIREBASE_READY) {
      await db.collection(collections.attendance).doc(targetDate).set({ lastUpdated: new Date().toISOString() }, { merge: true });
      await db.collection(collections.attendance).doc(targetDate).collection('students').doc(String(studentId)).set(record, { merge: true });
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      const branchData = data[branch];
      if (!branchData.attendance[targetDate]) {
        branchData.attendance[targetDate] = {};
      }
      branchData.attendance[targetDate][studentId] = record;
      saveJsonDb(data);
    }

    console.log('========================================');
    console.log('[POST /api/attendance] Checking status for email...');
    console.log('[POST /api/attendance] Student ID:', studentId);
    console.log('[POST /api/attendance] Status:', status);
    console.log('[POST /api/attendance] status.toLowerCase() === "absent":', status.toLowerCase() === 'absent');
    console.log('[POST /api/attendance] isMailerReady:', isMailerReady);
    
    if (status.toLowerCase() === 'absent' && isMailerReady) {
      console.log('[POST /api/attendance] ✅ Sending email!');
      // Non-blocking email send: don't wait for it!
      sendParentEmail('absent', { ...student, id: studentId }, { date: targetDate })
        .catch(err => {
          console.warn(`[POST /api/attendance] Email sync failed (non-blocking): ${err.message}`);
          console.warn(err.stack);
        });
    } else {
      console.log('[POST /api/attendance] ❌ NOT sending email!');
    }
    apiOk(res, { studentId, ...record });
  } catch (err) { apiError(res, err.message); }
});

app.post('/api/attendance-bulk', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    const { date, records = [] } = req.body || {};
    if (!date || !Array.isArray(records)) return apiError(res, 'Missing date/records', 400);

    const targetDate = date;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const results = [];

    if (FIREBASE_READY) {
      await db.collection(collections.attendance).doc(targetDate).set({ lastUpdated: new Date().toISOString() }, { merge: true });
      const batch = db.batch();
      
      for (const rec of records) {
        const { studentId, status } = rec || {};
        if (!studentId || !status) continue;

        const sDoc = await db.collection(collections.students).doc(String(studentId)).get();
        if (!sDoc.exists) continue;
        const sData = sDoc.data();

        const entry = {
          name: sData.name || 'Unknown',
          class: sData.cls || '—',
          status,
          time,
          date: targetDate
        };

        const docRef = db.collection(collections.attendance).doc(targetDate).collection('students').doc(String(studentId));
        batch.set(docRef, entry, { merge: true });
        results.push({ studentId, ...entry });

        console.log('========================================');
        console.log('[POST /api/attendance-bulk] Checking status for email...');
        console.log('[POST /api/attendance-bulk] Student ID:', studentId);
        console.log('[POST /api/attendance-bulk] Status:', status);
        console.log('[POST /api/attendance-bulk] status.toLowerCase() === "absent":', status.toLowerCase() === 'absent');
        console.log('[POST /api/attendance-bulk] isMailerReady:', isMailerReady);
        
        if (status.toLowerCase() === 'absent' && isMailerReady) {
          console.log('[POST /api/attendance-bulk] ✅ Sending email!');
          // Non-blocking email send
          const student = { id: sDoc.id, ...sData };
          sendParentEmail('absent', student, { date: targetDate })
            .catch(err => {
              console.warn(`[POST /api/attendance-bulk] Email sync failed (non-blocking): ${err.message}`);
              console.warn(err.stack);
            });
        } else {
          console.log('[POST /api/attendance-bulk] ❌ NOT sending email!');
        }
      }
      
      await batch.commit();
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      const branchData = data[branch];
      if (!branchData.attendance[targetDate]) {
        branchData.attendance[targetDate] = {};
      }

      for (const rec of records) {
        const { studentId, status } = rec || {};
        if (!studentId || !status) continue;

        const student = branchData.students.find(s => s.id == studentId);
        if (!student) continue;

        const entry = {
          name: student.name || 'Unknown',
          class: student.cls || '—',
          status,
          time,
          date: targetDate
        };

        branchData.attendance[targetDate][studentId] = entry;
        results.push({ studentId, ...entry });

        if (status.toLowerCase() === 'absent' && isMailerReady) {
          // Non-blocking email send
          sendParentEmail('absent', student, { date: targetDate })
            .catch(err => {
              console.warn(`[POST /api/attendance-bulk] Email sync failed (non-blocking): ${err.message}`);
              console.warn(err.stack);
            });
        }
      }
      
      saveJsonDb(data);
    }

    apiOk(res, results);
  } catch (err) { apiError(res, err.message); }
});

// ==================== FEE CATEGORIES ====================
app.get('/api/fee-categories', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    if (FIREBASE_READY) {
      const snapshot = await db.collection(collections.feeCategories).get();
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      apiOk(res, list);
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, feeCategories: [] };
      apiOk(res, data[branch].feeCategories || []);
    }
  } catch (err) { apiError(res, err.message); }
});

app.post('/api/fee-categories', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const category = req.body || {};
    const id = category.id || Date.now().toString();
    delete category.id;
    
    if (FIREBASE_READY) {
      await db.collection(collections.feeCategories).doc(id).set(category, { merge: true });
      const doc = await db.collection(collections.feeCategories).doc(id).get();
      apiOk(res, { id, ...doc.data() });
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, feeCategories: [] };
      const idx = data[branch].feeCategories.findIndex(c => c.id == id);
      if (idx !== -1) {
        data[branch].feeCategories[idx] = { id, ...category };
      } else {
        data[branch].feeCategories.push({ id, ...category });
      }
      saveJsonDb(data);
      apiOk(res, data[branch].feeCategories.find(c => c.id == id));
    }
  } catch (err) { apiError(res, err.message); }
});

app.delete('/api/fee-categories/:id', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const { id } = req.params;
    if (!id) return apiError(res, 'Missing id', 400);
    
    if (FIREBASE_READY) {
      await db.collection(collections.feeCategories).doc(id).delete();
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, feeCategories: [] };
      data[branch].feeCategories = data[branch].feeCategories.filter(c => c.id != id);
      saveJsonDb(data);
    }
    apiOk(res, { id });
  } catch (err) { apiError(res, err.message); }
});

// ==================== SCHOOL SETTINGS ====================
app.get('/api/school', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    if (FIREBASE_READY) {
      const doc = await db.collection(collections.school).doc('settings').get();
      apiOk(res, doc.exists ? doc.data() : { name: 'Hoot & Howl Learning' });
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, school: { name: 'Hoot & Howl Learning' } };
      apiOk(res, data[branch].school || { name: 'Hoot & Howl Learning' });
    }
  } catch (err) { apiError(res, err.message); }
});

app.post('/api/school', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const school = req.body || {};
    
    if (FIREBASE_READY) {
      await db.collection(collections.school).doc('settings').set(school, { merge: true });
      const doc = await db.collection(collections.school).doc('settings').get();
      apiOk(res, doc.data());
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, school: { name: 'Hoot & Howl Learning' } };
      data[branch].school = { ...data[branch].school, ...school };
      saveJsonDb(data);
      apiOk(res, data[branch].school);
    }
  } catch (err) { apiError(res, err.message); }
});

// ==================== TIMETABLE ====================
app.get('/api/timetable', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    if (FIREBASE_READY) {
      const snapshot = await db.collection(collections.timetable).get();
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      apiOk(res, list);
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, timetable: [] };
      apiOk(res, data[branch].timetable || []);
    }
  } catch (err) { apiError(res, err.message); }
});

app.post('/api/timetable', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const entry = req.body || {};
    const id = entry.id || Date.now().toString();
    delete entry.id;
    
    if (FIREBASE_READY) {
      await db.collection(collections.timetable).doc(id).set(entry, { merge: true });
      const doc = await db.collection(collections.timetable).doc(id).get();
      apiOk(res, { id, ...doc.data() });
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, timetable: [] };
      const idx = data[branch].timetable.findIndex(t => t.id == id);
      if (idx !== -1) {
        data[branch].timetable[idx] = { id, ...entry };
      } else {
        data[branch].timetable.push({ id, ...entry });
      }
      saveJsonDb(data);
      apiOk(res, data[branch].timetable.find(t => t.id == id));
    }
  } catch (err) { apiError(res, err.message); }
});

app.delete('/api/timetable/:id', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const { id } = req.params;
    if (!id) return apiError(res, 'Missing id', 400);
    
    if (FIREBASE_READY) {
      await db.collection(collections.timetable).doc(id).delete();
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, timetable: [] };
      data[branch].timetable = data[branch].timetable.filter(t => t.id != id);
      saveJsonDb(data);
    }
    apiOk(res, { id });
  } catch (err) { apiError(res, err.message); }
});

// ==================== EXPENSES ====================
app.get('/api/expenses', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    if (FIREBASE_READY) {
      const snapshot = await db.collection(collections.expenses).get();
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      apiOk(res, list);
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, expenses: [] };
      apiOk(res, data[branch].expenses || []);
    }
  } catch (err) { apiError(res, err.message); }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const expense = req.body || {};
    const id = expense.id || Date.now().toString();
    delete expense.id;
    
    if (FIREBASE_READY) {
      await db.collection(collections.expenses).doc(id).set(expense, { merge: true });
      const doc = await db.collection(collections.expenses).doc(id).get();
      apiOk(res, { id, ...doc.data() });
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, expenses: [] };
      const idx = data[branch].expenses.findIndex(e => e.id == id);
      if (idx !== -1) {
        data[branch].expenses[idx] = { id, ...expense };
      } else {
        data[branch].expenses.push({ id, ...expense });
      }
      saveJsonDb(data);
      apiOk(res, data[branch].expenses.find(e => e.id == id));
    }
  } catch (err) { apiError(res, err.message); }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    
    const { id } = req.params;
    if (!id) return apiError(res, 'Missing id', 400);
    
    if (FIREBASE_READY) {
      await db.collection(collections.expenses).doc(id).delete();
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {}, expenses: [] };
      data[branch].expenses = data[branch].expenses.filter(e => e.id != id);
      saveJsonDb(data);
    }
    apiOk(res, { id });
  } catch (err) { apiError(res, err.message); }
});

// Admin Management Endpoints
app.post('/api/admin/create', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);

    const { email, password, name, branch, isSuper = false } = req.body || {};
    if (!email || !password || !name || !branch) return apiError(res, 'Missing required fields: email, password, name, branch', 400);

    const allowedBranches = ['branch1', 'branch2', 'super'];
    if (!allowedBranches.includes(branch)) return apiError(res, 'Invalid branch', 400);

    // Check permissions:
    // - Super admin can create any admin in any branch
    // - Normal admin can only create admins in their own branch and cannot make super admins
    if (!session.isSuper) {
      if (branch !== session.branch) {
        return apiError(res, 'You can only create admins in your own branch', 403);
      }
      if (isSuper) {
        return apiError(res, 'Only super admin can create other super admins', 403);
      }
    }

    if (FIREBASE_READY) {
      // Create user in Firebase Auth
      const userRecord = await auth.createUser({
        email: email,
        password: password,
        displayName: name
      });

      // Create admin document in Firestore
      await db.collection('admins').doc(userRecord.uid).set({
        email: email,
        name: name,
        branch: branch,
        isSuper: isSuper,
        createdAt: new Date().toISOString()
      });

      apiOk(res, { uid: userRecord.uid, email, name, branch, isSuper });
    } else {
      apiError(res, 'Firebase not initialized. Admin creation requires Firebase.', 503);
    }
  } catch (err) {
    console.error('[POST /api/admin/create] Error:', err);
    apiError(res, err.message);
  }
});

app.get('/api/admin/list', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);

    if (FIREBASE_READY) {
      let query = db.collection('admins');
      
      // If not super admin, only show admins from the same branch
      if (!session.isSuper) {
        query = query.where('branch', '==', session.branch);
      }
      
      const snapshot = await query.get();
      const admins = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
      apiOk(res, admins);
    } else {
      apiError(res, 'Firebase not initialized.', 503);
    }
  } catch (err) {
    console.error('[GET /api/admin/list] Error:', err);
    apiError(res, err.message);
  }
});

app.put('/api/admin/:uid', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);

    const { uid } = req.params;
    const { name, branch, isSuper, password } = req.body || {};
    
    if (!uid) return apiError(res, 'Missing admin UID', 400);

    const allowedBranches = ['branch1', 'branch2', 'super'];
    if (branch && !allowedBranches.includes(branch)) return apiError(res, 'Invalid branch', 400);

    if (FIREBASE_READY) {
      // Get the admin to update
      const adminDoc = await db.collection('admins').doc(uid).get();
      if (!adminDoc.exists) return apiError(res, 'Admin not found', 404);
      
      const adminToUpdate = adminDoc.data();
      
      // Check permissions
      if (!session.isSuper) {
        // Normal admin can only update admins in their own branch
        if (adminToUpdate.branch !== session.branch) {
          return apiError(res, 'You can only update admins in your own branch', 403);
        }
        // Normal admin cannot promote to super admin
        if (isSuper && !adminToUpdate.isSuper) {
          return apiError(res, 'Only super admin can promote to super admin', 403);
        }
        // Normal admin cannot change branch
        if (branch && branch !== adminToUpdate.branch) {
          return apiError(res, 'You cannot change admin branch', 403);
        }
        // Normal admin cannot update their own isSuper status
        if (uid === session.uid && typeof isSuper !== 'undefined') {
          return apiError(res, 'You cannot change your own super admin status', 403);
        }
      }

      // Update Firebase Auth if needed
      if (password || name) {
        const updateData = {};
        if (password) updateData.password = password;
        if (name) updateData.displayName = name;
        await auth.updateUser(uid, updateData);
      }

      // Update Firestore document
      const adminData = {};
      if (name) adminData.name = name;
      if (branch && session.isSuper) adminData.branch = branch; // Only super admin can change branch
      if (typeof isSuper !== 'undefined' && session.isSuper) adminData.isSuper = isSuper; // Only super admin can change super status
      adminData.updatedAt = new Date().toISOString();

      await db.collection('admins').doc(uid).update(adminData);
      
      // Get updated admin data
      const doc = await db.collection('admins').doc(uid).get();
      apiOk(res, { uid, ...doc.data() });
    } else {
      apiError(res, 'Firebase not initialized.', 503);
    }
  } catch (err) {
    console.error('[PUT /api/admin/:uid] Error:', err);
    apiError(res, err.message);
  }
});

app.delete('/api/admin/:uid', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);

    const { uid } = req.params;
    if (!uid) return apiError(res, 'Missing admin UID', 400);

    // Don't allow deleting yourself
    if (uid === session.uid) return apiError(res, 'Cannot delete your own account', 400);

    if (FIREBASE_READY) {
      // Get the admin to delete
      const adminDoc = await db.collection('admins').doc(uid).get();
      if (!adminDoc.exists) return apiError(res, 'Admin not found', 404);
      
      const adminToDelete = adminDoc.data();
      
      // Check permissions
      if (!session.isSuper) {
        // Normal admin can only delete admins in their own branch
        if (adminToDelete.branch !== session.branch) {
          return apiError(res, 'You can only delete admins in your own branch', 403);
        }
        // Normal admin cannot delete super admins
        if (adminToDelete.isSuper) {
          return apiError(res, 'Only super admin can delete other super admins', 403);
        }
      }

      // Delete from Firebase Auth
      await auth.deleteUser(uid);
      // Delete from Firestore
      await db.collection('admins').doc(uid).delete();
      apiOk(res, { uid });
    } else {
      apiError(res, 'Firebase not initialized.', 503);
    }
  } catch (err) {
    console.error('[DELETE /api/admin/:uid] Error:', err);
    apiError(res, err.message);
  }
});

app.post('/api/fee-overdue', async (req, res) => {
  try {
    const session = await verifySession(req);
    if (!session) return apiError(res, 'Unauthorized', 401);
    const requestedBranch = req.query.branch || null;
    const collections = getCollectionsForAdmin(session, requestedBranch);
    const { invoiceId } = req.body || {};
    if (!invoiceId) return apiError(res, 'Missing invoiceId', 400);
    
    let invoice, student;
    if (FIREBASE_READY) {
      const iDoc = await db.collection(collections.invoices).doc(invoiceId).get();
      if (!iDoc.exists) return apiError(res, 'Invoice not found', 404);
      invoice = { id: iDoc.id, ...iDoc.data() };
      await db.collection(collections.invoices).doc(invoiceId).update({ status: 'overdue' });
      
      student = { name: 'Student', email: invoice.studentEmail };
      if (invoice.studentId) {
        const sDoc = await db.collection(collections.students).doc(invoice.studentId).get();
        if (sDoc.exists) student = { id: sDoc.id, ...sDoc.data() };
      }
    } else {
      const data = getJsonDb();
      const branch = collections.branch;
      if (!data[branch]) data[branch] = { students: [], invoices: [], attendance: {} };
      const branchData = data[branch];
      const idx = branchData.invoices.findIndex(i => i.id === invoiceId);
      if (idx === -1) return apiError(res, 'Invoice not found', 404);
      
      invoice = branchData.invoices[idx];
      branchData.invoices[idx].status = 'overdue';
      saveJsonDb(data);
      
      student = branchData.students.find(s => s.id === invoice.studentId || s.name === invoice.sname) || { name: 'Student', email: invoice.studentEmail };
    }

    if (isMailerReady) await sendParentEmail('overdue', student, { id: invoice.id, total: invoice.total });
    apiOk(res, { id: invoice.id, status: 'overdue' });
  } catch (err) { apiError(res, err.message); }
});

app.listen(PORT, () => { 
  console.log('=================================================');
  console.log('🚀 Server started!');
  console.log(`📡 Listening on http://localhost:${PORT}`);
  console.log('=================================================');
  console.log('🔧 Server Status:');
  console.log('  - Firebase Ready:', FIREBASE_READY);
  console.log('  - Mailer Ready:', isMailerReady);
  console.log('  - SMTP User:', process.env.SMTP_USER || 'NOT SET');
  console.log('  - SMTP Pass:', process.env.SMTP_PASS ? 'SET (length: ' + process.env.SMTP_PASS.length + ')' : 'NOT SET');
  console.log('=================================================');
});
