import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import type { ReactNode } from 'react';
import { brand } from '@/theme/brand';
import { Providers } from './providers';

const brandFont = Nunito({ subsets: ['latin'], variable: '--font-brand', display: 'swap' });

export const metadata: Metadata = {
  title: 'ConKora · Administración',
  description: 'Sistema administrativo de ConKora',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: brand.crema,
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
