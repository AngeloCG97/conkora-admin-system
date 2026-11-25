import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * The only public page (issue #35): a Venta shared with its Cliente. Outside `(app)/`, so no AuthGuard and
 * no menu. The URL carries a secret token: never indexed, and no Referer is sent to photos or other hosts.
 */
export const metadata: Metadata = {
  title: 'Tu Venta · ConKora',
  description: 'Detalle de tu Venta en ConKora',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function PublicOrderLayout({ children }: { children: ReactNode }) {
  return children;
}
