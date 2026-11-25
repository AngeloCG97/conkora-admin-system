/** Web app manifest. `basePath` is "" locally and "/conkora-admin-system" on GitHub Pages. */
export function buildManifest(basePath) {
  const base = `${basePath}/`;
  const icon = (file, sizes, purpose) => ({
    src: `${basePath}/icons/${file}`,
    sizes,
    type: 'image/png',
    ...(purpose ? { purpose } : {}),
  });
  return {
    id: base,
    name: 'ConKora',
    short_name: 'ConKora',
    description: 'Sistema administrativo de ConKora',
    lang: 'es',
    start_url: base,
    scope: base,
    display: 'standalone',
    theme_color: '#E35D47',
    background_color: '#F4EFE6',
    icons: [
      icon('icon-192.png', '192x192', 'any'),
      icon('icon-512.png', '512x512', 'any'),
      icon('icon-maskable-512.png', '512x512', 'maskable'),
    ],
  };
}
