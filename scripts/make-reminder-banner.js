// Generates public/assets/reminder-banner.png - the header image on WhatsApp payment reminders.
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'public', 'assets');
const W = 1200;
const H = 630;

(async () => {
  const logo = await sharp(path.join(ASSETS, 'sbmn-logo.png')).resize(460, 460).composite([{ input: Buffer.from('<svg><circle cx="230" cy="230" r="230"/></svg>'), blend: 'dest-in' }]).png().toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3d1e"/><stop offset="1" stop-color="#14532d"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <text x="70" y="215" font-family="Helvetica, Arial, sans-serif" font-size="30" letter-spacing="6" fill="#d9c27a">PAYMENT REMINDER</text>
    <text x="70" y="300" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="bold" fill="#ffffff">your maintenance</text>
    <text x="70" y="385" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="bold" fill="#ffffff">due is pending</text>
    <rect x="70" y="430" width="120" height="6" rx="3" fill="#d9c27a"/>
  </svg>`;
  await sharp(Buffer.from(svg))
    .composite([{ input: logo, left: W - 460 - 60, top: (H - 460) / 2 }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(ASSETS, 'reminder-banner.png')); 
})();
