import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { config } from '@/lib/config';
import { brand } from '@/theme/brand';
import { Providers } from './providers';

// latin-ext carries U+20A1 (₡); the plain latin subset does not, so ₡ would fall back to a system font.
/** Display: headlines and logotype. */
const displayFont = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700'],
  variable: '--font-display',
  display: 'swap',
});

/** Text: body copy and details. */
const textFont = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-text',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ConKora · Administración',
  description: 'Sistema administrativo de ConKora',
  robots: { index: false, follow: false },
  // basePath is not added to these URLs by Next (only to file-convention icons).
  manifest: `${config.basePath}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${config.basePath}/icons/favicon-32.png`, sizes: '32x32', type: 'image/png' },
      { url: `${config.basePath}/icons/favicon-16.png`, sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: `${config.basePath}/icons/apple-touch-icon.png`, sizes: '180x180' }],
  },
  // Next only emits the standard mobile-web-app-capable; older iOS still reads the apple- one.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  appleWebApp: { capable: true, title: 'ConKora', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: brand.coralCorazon,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${displayFont.variable} ${textFont.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
