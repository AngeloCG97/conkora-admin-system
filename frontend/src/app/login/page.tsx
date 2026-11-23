'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Logo } from '@/components/layout/Logo';
import { LoginError, login } from '@/lib/auth';
import { config } from '@/lib/config';
import { getSession } from '@/lib/session';
import { wakeServer } from '@/lib/wake';

/**
 * After this long (or as soon as a request has to be retried), tell the user the free-tier
 * server is waking up (Render sleeps when idle; the first login can take 30–60 s).
 */
const SLOW_LOGIN_MS = 4000;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (getSession()) router.replace('/');
    else wakeServer(config.apiUrl);
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_LOGIN_MS);
    try {
      await login(username.trim(), password, { onWaking: () => setSlow(true) });
      router.replace('/');
    } catch (err) {
      setError(err instanceof LoginError ? err.message : 'Ocurrió un error inesperado.');
      setSubmitting(false);
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 } }}>
        <Box component="form" onSubmit={onSubmit} noValidate>
          <Stack spacing={2.5}>
            <Box sx={{ display: 'flex', justifyContent: 'center', pb: 1 }}>
              <Logo height={52} />
            </Box>
            <Typography variant="h5" component="h1" align="center">
              Iniciar sesión
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            {slow && (
              <Alert severity="info" icon={false} role="status">
                <AlertTitle>Despertando el servidor…</AlertTitle>
                El servidor gratuito se duerme cuando nadie lo usa. El primer ingreso puede tardar
                hasta un minuto; no cierres esta página.
                <LinearProgress sx={{ mt: 1.5 }} />
              </Alert>
            )}
            <TextField
              label="Usuario"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
            <TextField
              label="Contraseña"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting || !username.trim() || !password}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {slow ? 'Despertando el servidor…' : submitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
