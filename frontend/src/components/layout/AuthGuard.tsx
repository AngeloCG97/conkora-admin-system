'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Loading } from '@/components/feedback/Loading';
import { clearSession, getSession, tokenExpiry } from '@/lib/session';

/**
 * Renders children only with a valid (non-expired) session; otherwise goes to /login.
 * Also logs out automatically when the token expires while the app is open.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      clearSession();
      router.replace('/login/');
      return;
    }
    // localStorage is only readable after mount (static export), hence the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);

    const msUntilExpiry = (tokenExpiry(session.token)?.getTime() ?? 0) - Date.now();
    const timer = setTimeout(
      () => {
        clearSession();
        router.replace('/login/');
      },
      Math.min(msUntilExpiry, 2 ** 31 - 1),
    );
    return () => clearTimeout(timer);
  }, [router]);

  if (!ready) return <Loading fullScreen />;
  return children;
}
