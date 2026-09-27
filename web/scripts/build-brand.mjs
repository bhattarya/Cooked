// Cuts the COOKED logo (the wide Gemini-generated source image) into web-ready assets.
//   node scripts/build-brand.mjs /path/to/logo.jpeg
// The source background is warm black, so each crop gets a feathered alpha edge and sits flush on the page.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/build-brand.mjs <logo.jpeg>");
await mkdir("public/brand", { recursive: true });

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// RGBA raw buffer: colour from the crop, alpha = feathered distance to the crop edge
async function crop({ left, top, width, height }, feather) {
  const { data } = await sharp(src).extract({ left, top, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const dy = Math.min(y, height - 1 - y);
    for (let x = 0; x < width; x++) {
      const d = Math.min(dy, x, width - 1 - x);
      const i = (y * width + x) * 4, j = (y * width + x) * 3;
      out[i] = data[j]; out[i + 1] = data[j + 1]; out[i + 2] = data[j + 2];
      out[i + 3] = Math.round(255 * smooth(d / feather));
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } });
}

async function cut(name, box, outWidth, feather = 70) {
  const outHeight = Math.round((outWidth * box.height) / box.width);
  const img = await crop(box, feather);
  await img.resize(outWidth, outHeight).webp({ quality: 90, alphaQuality: 95 }).toFile(`public/brand/${name}.webp`);
  console.log("wrote", name, `${box.width}x${box.height} -> ${outWidth}x${outHeight}`);
}

// full emblem: dog, skillet, flames, COOKED banner + tagline
await cut("cooked-emblem", { left: 760, top: 70, width: 1320, height: 1400 }, 1100);
// mark only: dog, hat, skillet ring (no banner) for headers and the ThinkingOrb stage
await cut("cooked-mark", { left: 800, top: 100, width: 1250, height: 830 }, 900, 120);

// app icon: the chef dog on warm black, rounded square
const size = 256, r = 56;
const { data } = await sharp(src).extract({ left: 1010, top: 130, width: 800, height: 800 }).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const icon = Buffer.alloc(size * size * 4);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const i = (y * size + x) * 4, j = (y * size + x) * 3;
  const cx = Math.max(r - x, 0, x - (size - 1 - r)), cy = Math.max(r - y, 0, y - (size - 1 - r));
  const inside = cx * cx + cy * cy <= r * r;
  icon[i] = data[j]; icon[i + 1] = data[j + 1]; icon[i + 2] = data[j + 2]; icon[i + 3] = inside ? 255 : 0;
}
await sharp(icon, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toFile("app/icon.png");
console.log("wrote app/icon.png");
