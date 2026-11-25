import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../pwa/manifest.mjs';
import { buildPwa } from './build-pwa.mjs';

function fakeOut() {
  const dir = mkdtempSync(join(tmpdir(), 'pwa-out-'));
  mkdirSync(join(dir, 'viajes'));
  mkdirSync(join(dir, '_next/static/chunks'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<html>home</html>');
  writeFileSync(join(dir, 'viajes/index.html'), '<html>viajes</html>');
  writeFileSync(join(dir, '404.html'), '<html>404</html>');
  writeFileSync(join(dir, '_next/static/chunks/a.js'), 'a');
  return dir;
}

describe('buildManifest', () => {
  it('honors the basePath in start_url, scope and icons', () => {
    const m = buildManifest('/conkora-admin-system');
    expect(m.start_url).toBe('/conkora-admin-system/');
    expect(m.scope).toBe('/conkora-admin-system/');
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toBe('#E35D47');
    expect(m.background_color).toBe('#F4EFE6');
    expect(m.icons.map((i) => i.src)).toEqual([
      '/conkora-admin-system/icons/icon-192.png',
      '/conkora-admin-system/icons/icon-512.png',
      '/conkora-admin-system/icons/icon-maskable-512.png',
    ]);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('works without basePath', () => {
    const m = buildManifest('');
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.icons[0].src).toBe('/icons/icon-192.png');
  });
});

describe('buildPwa', () => {
  it('writes the manifest and a valid sw.js with a basePath-prefixed precache list', () => {
    const outDir = fakeOut();
    const { version, precache } = buildPwa({ outDir, basePath: '/conkora-admin-system' });
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.webmanifest'), 'utf8'));
    expect(manifest.start_url).toBe('/conkora-admin-system/');
    expect(precache).toEqual(
      expect.arrayContaining([
        '/conkora-admin-system/',
        '/conkora-admin-system/viajes/',
        '/conkora-admin-system/_next/static/chunks/a.js',
        '/conkora-admin-system/manifest.webmanifest',
      ]),
    );
    expect(precache).not.toContain('/conkora-admin-system/404.html');
    const sw = readFileSync(join(outDir, 'sw.js'), 'utf8');
    expect(sw).toContain(`'conkora-${version}'`);
    expect(sw).not.toMatch(/__[A-Z_]+__|^export /m);
    expect(() => new vm.Script(sw)).not.toThrow();
  });

  it('changes the cache version when a file changes', () => {
    const outDir = fakeOut();
    const first = buildPwa({ outDir, basePath: '' }).version;
    writeFileSync(join(outDir, '_next/static/chunks/a.js'), 'changed');
    expect(buildPwa({ outDir, basePath: '' }).version).not.toBe(first);
  });
});
