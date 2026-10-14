// Builds the app icons (public/favicon.png, public/icon-192.png) from an SVG.
import sharp from 'sharp';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <defs>
    <filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
    <linearGradient id="b" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#14c85a"/><stop offset="1" stop-color="#7dffb0"/></linearGradient>
  </defs>
  <rect width="192" height="192" rx="44" fill="#000"/>
  <rect x="6" y="6" width="180" height="180" rx="40" fill="none" stroke="#1d2a24" stroke-width="3"/>
  <path d="M44 146 H96 V96 H140 V60" fill="none" stroke="#39ff88" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" filter="url(#g)" opacity=".7"/>
  <path d="M44 146 H96 V96 H140 V60" fill="none" stroke="url(#b)" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="133" cy="58" r="4.5" fill="#fff"/><circle cx="147" cy="58" r="4.5" fill="#fff"/>
  <circle cx="133" cy="57" r="2.2" fill="#071019"/><circle cx="147" cy="57" r="2.2" fill="#071019"/>
  <circle cx="64" cy="58" r="15" fill="#ff3b5c" filter="url(#g)" opacity=".8"/>
  <circle cx="64" cy="60" r="13" fill="#ff3b5c"/>
  <circle cx="59" cy="55" r="4" fill="#fff" opacity=".75"/>
  <path d="M65 47 q6 -8 11 -4" stroke="#4cff7a" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;
await sharp(Buffer.from(svg)).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(Buffer.from(svg)).resize(64, 64).png().toFile('public/favicon.png');
console.log('icons written');
