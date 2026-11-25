// Generates the PWA icons in public/icons from public/logo-tinta.svg on the Crema background.
//   cd frontend && npm run icons
// Rerun it when the official logo replaces public/logo-tinta.svg (same file name) and commit the PNGs.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const CREMA = '#F4EFE6';
const logoPath = fileURLToPath(new URL('../public/logo-tinta.svg', import.meta.url));
const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));

// logoWidth = share of the canvas the logo may use. Maskable icons get cropped to a circle by the OS:
// everything important must stay inside the central 80% (safe zone), so the logo uses 60%.
const ICONS = [
  { file: 'icon-192.png', size: 192, logoWidth: 0.8 },
  { file: 'icon-512.png', size: 512, logoWidth: 0.8 },
  { file: 'icon-maskable-512.png', size: 512, logoWidth: 0.6 },
  { file: 'apple-touch-icon.png', size: 180, logoWidth: 0.8 },
];

mkdirSync(outDir, { recursive: true });
for (const { file, size, logoWidth } of ICONS) {
  const logo = await sharp(logoPath, { density: 600 })
    .resize({ width: Math.round(size * logoWidth) })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: CREMA } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${outDir}${file}`);
  console.log(`icons/${file} (${size}x${size})`);
}
