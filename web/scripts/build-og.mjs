// Builds the two images that need the COOKED emblem on a background of our own choosing.
//   node scripts/build-og.mjs
//
//   components/landing/emblem-cutout.webp   the emblem with its baked-in dark background keyed out, so the
//                                           landing can put its own glow, embers and rings behind it
//   app/opengraph-image.png                 the 1200x630 social preview (Next serves it as og:image)
//
// The brand assets in public/brand keep their original backdrop (a warm brown vignette), which shows as a
// lit rectangle on any other background. The cut-out floods inward from the image border through everything
// darker than the badge's gold outline, so only the outside is removed: the dark pan interior and the black
// letter outlines are enclosed by that outline and stay opaque.
//
// The preview's text is set in system condensed/serif faces (Impact and Georgia italic on macOS, with
// fallbacks). The brand fonts ship as woff2, which librsvg cannot read; the emblem carries the real
// lettering, so the text here only has to sit well beside it.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const SRC = "public/brand/cooked-emblem.webp";
const CUTOUT = "components/landing/emblem-cutout.webp";
const OG = "app/opengraph-image.png";

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

async function keyOutBackground() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const LIMIT = 135; // brightest channel the background may have; the gold outline starts well above it
  const bg = new Uint8Array(W * H);
  const stack = [];
  const dark = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < LIMIT || data[i * 4 + 3] < 250;
  const push = (x, y) => {
    const i = y * W + x;
    if (!bg[i] && dark(i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) (push(x, 0), push(x, H - 1));
  for (let y = 0; y < H; y++) (push(0, y), push(W - 1, y));
  while (stack.length) {
    const i = stack.pop();
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  // Outside pixels fade out by brightness, so flame tips and the outline's soft halo keep a natural falloff.
  const alpha = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) {
    alpha[i] = bg[i] ? Math.round(255 * smooth(58, LIMIT, Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]))) : 255;
  }
  const { data: soft, info: si } = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(1.1).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = data[i * 4];
    out[i * 4 + 1] = data[i * 4 + 1];
    out[i * 4 + 2] = data[i * 4 + 2];
    out[i * 4 + 3] = soft[i * si.channels];
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } });
}

const cutout = await keyOutBackground();
await cutout.clone().webp({ quality: 90, alphaQuality: 100 }).toFile(CUTOUT);
console.log("wrote", CUTOUT);

// ---- social preview -------------------------------------------------------------------------------------
const OW = 1200;
const OH = 630;
const EH = 590; // emblem height on the card
const EW = Math.round((EH * 1100) / 1167);
const ex = 44;
const ey = Math.round((OH - EH) / 2);
const emblem = await cutout.clone().resize(EW, EH).png().toBuffer();

const sans = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const condensed = "Impact, 'Avenir Next Condensed', 'Arial Narrow', sans-serif";
const serif = "Georgia, 'Times New Roman', serif";
const tx = 612;

const backdrop = `
<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}">
  <defs>
    <radialGradient id="glow" cx="${ex + EW / 2}" cy="${OH / 2}" r="470" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f6b41a" stop-opacity="0.34"/>
      <stop offset="0.55" stop-color="#ff8a1a" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#f6b41a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="heat" cx="600" cy="${OH + 60}" r="620" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff7a1a" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="600" cy="300" r="760" gradientUnits="userSpaceOnUse">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.6"/>
    </radialGradient>
  </defs>
  <rect width="${OW}" height="${OH}" fill="#0a0805"/>
  <rect width="${OW}" height="${OH}" fill="url(#heat)"/>
  <rect width="${OW}" height="${OH}" fill="url(#glow)"/>
  <rect width="${OW}" height="${OH}" fill="url(#vig)"/>
</svg>`;

const text = `
<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}">
  <defs>
    <linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd15c"/>
      <stop offset="0.5" stop-color="#f6b41a"/>
      <stop offset="1" stop-color="#b97a06"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f6b41a" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#f6b41a" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <text x="${tx}" y="128" font-family="${sans}" font-size="16" letter-spacing="5" fill="#b97a06">EARLY WARNING  ·  STRESS TEST</text>
  <rect x="${tx}" y="148" width="200" height="2" fill="url(#rule)"/>
  <text x="${tx - 3}" y="262" font-family="${condensed}" font-size="98" letter-spacing="1" fill="#fff8e7">KNOW BEFORE</text>
  <text x="${tx - 3}" y="362" font-family="${condensed}" font-size="98" letter-spacing="1" fill="url(#goldText)">IT’S TOO LATE.</text>
  <text x="${tx}" y="432" font-family="${serif}" font-style="italic" font-size="42" fill="#ffd15c">Then get un-cooked.</text>
  <text x="${tx}" y="500" font-family="${sans}" font-size="21" fill="#a89f8a">An early-warning and stress test for degree trajectories.</text>
  <text x="${tx}" y="534" font-family="${sans}" font-size="16" fill="#6f6858">Built on the synthetic HackUMBC 2026 dataset. Not real students.</text>
</svg>`;

const png = await sharp(Buffer.from(backdrop))
  .composite([
    { input: emblem, left: ex, top: ey },
    { input: Buffer.from(text), left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();
await writeFile(OG, png);
await writeFile("app/opengraph-image.alt.txt", "COOKED: a chef-hat Labrador over a skillet, with the line “Know before it’s too late. Then get un-cooked.”");
console.log("wrote", OG, `${OW}x${OH}`, `${(png.length / 1024).toFixed(0)} KB`);
