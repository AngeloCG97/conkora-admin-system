'use client';

import Alert from '@mui/material/Alert';
import { useSyncExternalStore } from 'react';
import { hasNetworkFailed, isOffline, subscribeConnectivity } from '@/lib/connectivity';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  const unsubscribe = subscribeConnectivity(onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
    unsubscribe();
  };
}

const getSnapshot = () => isOffline(navigator.onLine, hasNetworkFailed());
const getServerSnapshot = () => false;

/** Fixed bar shown while there is no connection (browser offline or GraphQL unreachable). */
export function OfflineBanner() {
  const offline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!offline) return null;
  return (
    <Alert
      severity="warning"
      variant="filled"
      role="status"
      sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1300, borderRadius: 0, justifyContent: 'center' }}
    >
      Sin conexión: los datos no se pueden cargar
    </Alert>
  );
}
