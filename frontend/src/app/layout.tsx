import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import type { ReactNode } from 'react';
import { config } from '@/lib/config';
import { brand } from '@/theme/brand';
import { Providers } from './providers';

const brandFont = Nunito({ subsets: ['latin'], variable: '--font-brand', display: 'swap' });

export const metadata: Metadata = {
  title: 'ConKora · Administración',
  description: 'Sistema administrativo de ConKora',
  robots: { index: false, follow: false },
  // basePath is not added to these URLs by Next (only to file-convention icons).
  manifest: `${config.basePath}/manifest.webmanifest`,
  icons: { apple: [{ url: `${config.basePath}/icons/apple-touch-icon.png`, sizes: '180x180' }] },
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
    <html lang="es" className={brandFont.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
