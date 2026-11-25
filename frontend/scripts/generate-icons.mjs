// Generates the PWA icons and favicons in public/icons from the heart of the ConKora logo
// (public/icon-corazon*.svg, 512x512 with the Crema background included).
//   cd frontend && npm run icons
// Rerun it when the icon-corazon*.svg sources change and commit the PNGs.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = new URL('../public/', import.meta.url);
const outDir = fileURLToPath(new URL('icons/', publicDir));

// The maskable source keeps the heart inside the central 80% (safe zone) because the OS crops maskable
// icons to a circle. The favicon source uses a filled heart: the outline gets lost at 16/32 px.
const ICONS = [
  { file: 'icon-192.png', size: 192, source: 'icon-corazon.svg' },
  { file: 'icon-512.png', size: 512, source: 'icon-corazon.svg' },
  { file: 'icon-maskable-512.png', size: 512, source: 'icon-corazon-maskable.svg' },
  { file: 'apple-touch-icon.png', size: 180, source: 'icon-corazon.svg' },
  { file: 'favicon-32.png', size: 32, source: 'icon-corazon-favicon.svg' },
  { file: 'favicon-16.png', size: 16, source: 'icon-corazon-favicon.svg' },
];

mkdirSync(outDir, { recursive: true });
for (const { file, size, source } of ICONS) {
  await sharp(fileURLToPath(new URL(source, publicDir)), { density: 300 })
    .resize(size, size)
    .png()
    .toFile(`${outDir}${file}`);
  console.log(`icons/${file} (${size}x${size})`);
}
