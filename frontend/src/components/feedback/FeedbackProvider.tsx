'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Snackbar from '@mui/material/Snackbar';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * App-wide feedback:
 *   const notify = useNotify();   notify.success('Viaje guardado'); notify.error('No se pudo guardar');
 *   const confirm = useConfirm(); if (await confirm({ title: '¿Eliminar el Viaje?', danger: true })) { ... }
 */

type Severity = 'success' | 'error' | 'info' | 'warning';

interface Notify {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Paints the confirm button as destructive (for deletions). */
  danger?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const NotifyContext = createContext<Notify | null>(null);
const ConfirmContext = createContext<Confirm | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ key: number; message: string; severity: Severity } | null>(null);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const show = useCallback((severity: Severity, message: string) => {
    setToast({ key: Date.now(), message, severity });
  }, []);

  const notify = useMemo<Notify>(
    () => ({
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
    }),
    [show],
  );

  const confirm = useCallback<Confirm>((options) => {
    resolveRef.current?.(false);
    setDialog(options);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const closeDialog = (result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setDialog(null);
  };

  return (
    <NotifyContext.Provider value={notify}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        <Snackbar
          key={toast?.key}
          open={toast !== null}
          autoHideDuration={toast?.severity === 'error' ? 8000 : 4000}
          onClose={(_event, reason) => reason !== 'clickaway' && setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setToast(null)}
            severity={toast?.severity ?? 'info'}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {toast?.message}
          </Alert>
        </Snackbar>

        <Dialog open={dialog !== null} onClose={() => closeDialog(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{dialog?.title}</DialogTitle>
          {dialog?.message && (
            <DialogContent>
              <DialogContentText>{dialog.message}</DialogContentText>
            </DialogContent>
          )}
          <DialogActions>
            <Button onClick={() => closeDialog(false)} color="inherit">
              {dialog?.cancelText ?? 'Cancelar'}
            </Button>
            <Button
              onClick={() => closeDialog(true)}
              variant="contained"
              color={dialog?.danger ? 'error' : 'primary'}
              autoFocus
            >
              {dialog?.confirmText ?? 'Aceptar'}
            </Button>
          </DialogActions>
        </Dialog>
      </ConfirmContext.Provider>
    </NotifyContext.Provider>
  );
}

export function useNotify(): Notify {
  const value = useContext(NotifyContext);
  if (!value) throw new Error('useNotify must be used inside <FeedbackProvider>');
  return value;
}

export function useConfirm(): Confirm {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error('useConfirm must be used inside <FeedbackProvider>');
  return value;
}
