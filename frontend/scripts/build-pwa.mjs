// Post-build step (npm "postbuild"): writes out/manifest.webmanifest and out/sw.js for the
// static export. Honors NEXT_PUBLIC_BASE_PATH like next.config.ts.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../pwa/manifest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** URL (with basePath) of an exported file; `x/index.html` is served as `x/`. */
function urlFor(file, basePath) {
  const rel = file.split(sep).join('/');
  if (rel === 'index.html') return `${basePath}/`;
  if (rel.endsWith('/index.html')) return `${basePath}/${rel.slice(0, -'index.html'.length)}`;
  return `${basePath}/${rel}`;
}

export function buildPwa({ outDir = join(root, 'out'), basePath = process.env.NEXT_PUBLIC_BASE_PATH || '' } = {}) {
  if (!existsSync(outDir)) throw new Error(`${outDir} does not exist: run "next build" first`);
  const generated = new Set(['sw.js', 'manifest.webmanifest']);
  const files = listFiles(outDir)
    .map((f) => relative(outDir, f))
    .filter((rel) => !generated.has(rel) && rel !== '.nojekyll' && rel !== '404.html')
    .sort();

  const hash = createHash('sha256');
  for (const rel of files) hash.update(rel).update(readFileSync(join(outDir, rel)));
  const version = hash.digest('hex').slice(0, 12);

  const manifest = buildManifest(basePath);
  writeFileSync(join(outDir, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);

  const policy = readFileSync(join(root, 'pwa/sw-policy.mjs'), 'utf8').replace(/^export /gm, '');
  const precache = [...files.map((rel) => urlFor(rel, basePath)), `${basePath}/manifest.webmanifest`];
  const sw = readFileSync(join(root, 'pwa/sw.template.js'), 'utf8')
    .replace('__BASE_PATH__', basePath)
    .replace('__VERSION__', version)
    .replace('__PRECACHE__', JSON.stringify(precache, null, 2))
    .replace('/*__POLICY__*/', () => policy);
  writeFileSync(join(outDir, 'sw.js'), sw);
  return { version, precache, manifest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, precache } = buildPwa();
  console.log(`PWA: sw.js (cache conkora-${version}, ${precache.length} files) + manifest.webmanifest`);
}
