
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

// Invoice Themes (same as frontend)
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

// Build Invoice HTML (exact copy of frontend buildInvoiceHTML)
function buildInvoiceHTML(snap) {
  const t = INV_THEMES[snap?.theme || 'navy'] || INV_THEMES.navy;
  const s = snap?.school || { name: 'Hoot & Howl Learning', tagline: 'Educational Excellence' };
  const fmt = (num) => '₹' + parseFloat(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fdFmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  let sub = 0; (snap?.items || []).forEach(i => { sub += Math.max(0, (i.qty * i.rate) - (i.disc || 0)); });
  const disc = parseFloat(snap?.disc || 0), conc = parseFloat(snap?.conc_amt || 0), late = parseFloat(snap?.late || 0), taxPct = parseFloat(snap?.tax || 0);
  const after = sub - disc - conc + late, taxAmt = after * taxPct / 100, grand = Math.round(after + taxAmt), roff = grand - (after + taxAmt);
  const BLANKS = Math.max(0, 4 - (snap?.items || []).length);
  const feeRows = (snap?.items || []).map((item, index) => {
    const amount = Math.max(0, (item.qty * item.rate) - (item.disc || 0));
    return `<tr style="border-bottom:1px solid ${t.border}"><td style="padding:8px 10px;text-align:center;font-weight:700;color:#9CA3AF;font-size:11px">${String(index + 1).padStart(2, '0')}</td><td style="padding:8px 10px">${item?.desc || ''}</td><td style="padding:8px 10px;text-align:center;color:#6B7280">${item?.hsn || ''}</td><td style="padding:8px 10px;text-align:center">${item.qty}</td><td style="padding:8px 10px;text-align:right">${item.rate ? fmt(item.rate) : ''}</td><td style="padding:8px 10px;text-align:right">${item.disc ? `-${fmt(item.disc)}` : '—'}</td><td style="padding:8px 10px;text-align:right;font-weight:700">${amount ? fmt(amount) : ''}</td></tr>`;
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
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Plus Jakarta Sans', system-ui, sans-serif; }</style>
</head>
<body>
<div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;color:#0F1E38;background:#fff;position:relative;overflow:hidden">
${wmHTML}
<div style="background:${t.bg};padding:22px 24px 18px;display:flex;justify-content:space-between;align-items:flex-start">
${logoBase64
? `<div><img src="${logoBase64}" style="max-height:44px;max-width:130px;object-fit:contain;display:block"><div style="font-size:9px;color:${t.sub};margin-top:4px">${s.tagline || 'Educational Excellence'}</div></div>`
: `<div><div style="font-size:22px;font-weight:800;color:${t.text};letter-spacing:-.3px">${s.name || 'Hoot & Howl Learning'}</div><div style="font-size:9.5px;color:${t.sub};margin-top:1px">${s.tagline || ''}</div></div>`}
<div style="text-align:right">
<div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${t.sub}">${invTitle}</div>
<div style="font-size:16px;font-weight:800;color:${t.accent};margin-top:2px;font-family:'DM Mono',monospace">${snap?.no || '—'}</div>
<div style="font-size:13px;font-weight:700;color:${t.text};margin-top:4px">${s.name || 'Hoot & Howl Learning'}</div>
${stampText ? `<div style="font-size:11px;font-weight:900;letter-spacing:2px;margin-top:6px;${stampStyle}">${stampText}</div>` : ''}
</div></div>
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
</div></div>
<div style="background:${t.rowbg};padding:8px 18px;display:flex;gap:20px;border-bottom:1px solid ${t.border};flex-wrap:wrap">
${[['DATE', fdFmt(snap?.date)], ['DUE DATE', snap?.due && snap?.mode !== 'receipt' ? fdFmt(snap.due) : '—'], ['FOR PERIOD', snap?.month || snap?.year || '—'], ['PAYMENT', snap?.paymethod || 'Cash'], snap?.ref ? ['REF', snap.ref] : null].filter(Boolean).map(([label, value]) => `<div style="padding:4px 0"><div style="font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#9CA3AF">${label}</div><div style="font-size:11px;font-weight:700;color:#0F1E38;margin-top:1px">${value}</div></div>`).join('')}
</div>
<table style="width:100%;border-collapse:collapse">
<thead><tr style="background:${t.rowbg};border-bottom:1.5px solid ${t.border}">
${['#', 'Description', 'HSN', 'QTY', 'Rate (₹)', 'Disc. (₹)', 'Amount (₹)'].map((heading, idx) => `<th style="padding:7px 10px;font-size:8px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${t.bg};text-align:${idx === 1 ? 'left' : idx === 0 ? 'center' : 'right'}">${heading}</th>`).join('')}
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
</div></div>
<div style="display:flex;justify-content:space-between;align-items:flex-end;padding:12px 18px;border-top:1px solid ${t.border};background:${t.rowbg}">
<div style="font-size:9.5px;color:#6B7280;max-width:55%">${s.footer_note || 'Thank you for your payment. Please retain this receipt for your records.'}</div>
<div style="text-align:center">
${sigHTML ? `<div style="min-height:36px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:4px">${sigHTML}</div>` : `<div style="height:32px"></div>`}
<div style="width:100px;border-bottom:1.5px solid ${t.bg};margin:0 auto 3px"></div>
<div style="font-size:9px;color:#6B7280">Authorized Signatory</div>
<div style="font-size:9px;font-weight:700;color:${t.bg}">${s.principal || s.name || ''}</div>
</div></div>
<div style="background:${t.bg};padding:5px 18px;display:flex;gap:14px">
${[s.phone, s.email, s.web].filter(Boolean).map((contact) => `<span style="font-size:9px;color:${t.sub}">${contact}</span>`).join('')}
</div></div>
</body>
</html>
`;
}

// Generate Invoice PDF using Puppeteer
async function generateInvoicePDF(invoice) {
  // Prepare snap data
  const snap = invoice.snap || {
    no: invoice.no,
    date: invoice.date,
    sname: invoice.sname,
    sclass: invoice.sclass,
    month: invoice.month,
    items: [],
    school: { name: 'Hoot & Howl Learning', tagline: 'Educational Excellence' }
  };

  // Add default item if none exist
  if (!snap.items || snap.items.length === 0) {
    snap.items = [{
      desc: `Tuition Fee - ${invoice.month || ''}`,
      hsn: '',
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

// Test function
async function testGenerateInvoicePDF() {
  console.log('Testing invoice PDF generation...');
  const invoice = {
    no: 'INV-001',
    date: '2026-06-03',
    sname: 'Test Student',
    sclass: '10',
    month: 'June 2026',
    grand: 3000,
    status: 'paid',
    snap: {
      no: 'INV-001',
      date: '2026-06-03',
      sname: 'Test Student',
      sclass: '10',
      sroll: '101',
      month: 'June 2026',
      items: [
        { desc: 'Tuition Fee', qty: 1, rate: 3000, disc: 0 }
      ],
      paymethod: 'Cash',
      theme: 'navy',
      school: {
        name: 'Hoot & Howl Learning',
        tagline: 'Educational Excellence'
      }
    }
  };

  try {
    const pdfBuffer = await generateInvoicePDF(invoice);
    const outputPath = path.join(__dirname, 'test-invoice.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);
    console.log(`✅ Test invoice generated successfully! Saved to ${outputPath}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating invoice PDF:', error);
    process.exit(1);
  }
}

// Run the test
testGenerateInvoicePDF();
