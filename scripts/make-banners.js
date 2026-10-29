// Generates one WhatsApp header banner per message type into public/assets/banners/<name>.png,
// in the same style as the payment-reminder banner (scripts/make-reminder-banner.js).
// Edit BANNERS below to change the wording, then run: node scripts/make-banners.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'public', 'assets');
const OUT = path.join(ASSETS, 'banners');
const W = 1200;
const H = 630;

const BANNERS = {
  welcome: { label: 'NEW MEMBER', line1: 'welcome to our', line2: 'community' },
  account: { label: 'PORTAL ACCESS', line1: 'your login account', line2: 'is ready' },
  reset: { label: 'PASSWORD RESET', line1: 'your one-time', line2: 'reset code' },
  test: { label: 'TEST MESSAGE', line1: 'whatsapp messages', line2: 'are working' },
  payment: { label: 'PAYMENT RECEIVED', line1: 'thank you for', line2: 'your payment' },
  donation: { label: 'DONATION', line1: 'thank you for', line2: 'your generosity' },
  expense: { label: 'EXPENSE UPDATE', line1: 'a new expense was', line2: 'recorded' },
  general: { label: 'ASSOCIATION NOTICE', line1: 'a message from', line2: 'the association' },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const logo = await sharp(path.join(ASSETS, 'sbmn-logo.png')).resize(460, 460).composite([{ input: Buffer.from('<svg><circle cx="230" cy="230" r="230"/></svg>'), blend: 'dest-in' }]).png().toBuffer();
  for (const [name, b] of Object.entries(BANNERS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3d1e"/><stop offset="1" stop-color="#14532d"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <text x="70" y="205" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="bold" letter-spacing="9" fill="#d9c27a">${b.label}</text>
    <text x="70" y="293" font-family="Helvetica, Arial, sans-serif" font-size="50" font-weight="normal" fill="#e8efe9">${b.line1}</text>
    <text x="70" y="392" font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="bold" fill="#ffffff">${b.line2}</text>
    <rect x="70" y="440" width="120" height="6" rx="3" fill="#d9c27a"/>
  </svg>`;
    await sharp(Buffer.from(svg))
      .composite([{ input: logo, left: W - 460 - 60, top: (H - 460) / 2 }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `${name}.png`));
    console.log(`wrote banners/${name}.png`);
  }
})();
