'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { useEffect, useRef, useState } from 'react';
import { config } from '@/lib/config';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker (production builds only) and, when a new version is installed and
 * waiting, offers "Actualizar". The new worker never takes over silently mid-session: it activates
 * (skipWaiting) and the page reloads only after the user accepts.
 */
export function PwaUpdater() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;

    const watch = (worker: ServiceWorker) => {
      worker.addEventListener('statechange', () => {
        // A controller means this is an update, not the very first install.
        if (worker.state === 'installed' && sw.controller) setWaiting(worker);
      });
    };
    const onControllerChange = () => {
      if (reloading.current) window.location.reload();
    };
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => {});
    };

    sw.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', checkForUpdate);
    const timer = setInterval(checkForUpdate, UPDATE_CHECK_MS);

    sw.register(`${config.basePath}/sw.js`, { scope: `${config.basePath}/` })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && sw.controller) setWaiting(reg.waiting);
        if (reg.installing) watch(reg.installing);
        reg.addEventListener('updatefound', () => reg.installing && watch(reg.installing));
      })
      .catch(() => {
        // The app works without a service worker (just not offline).
      });

    return () => {
      sw.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdate);
      clearInterval(timer);
    };
  }, []);

  const update = () => {
    if (!waiting) return;
    reloading.current = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <Snackbar open={waiting !== null} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <Alert
        severity="info"
        variant="filled"
        action={
          <Button color="inherit" size="small" onClick={update}>
            Actualizar
          </Button>
        }
      >
        Hay una versión nueva
      </Alert>
    </Snackbar>
  );
}
