'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Logo } from '@/components/layout/Logo';
import { LoginError, login } from '@/lib/auth';
import { getSession } from '@/lib/session';

/** After this long, tell the user the free-tier server is probably waking up. */
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
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_LOGIN_MS);
    try {
      await login(username.trim(), password);
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
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>
            {slow && (
              <Typography variant="body2" color="text.secondary" align="center" role="status">
                El servidor se está despertando, esto puede tardar hasta un minuto…
              </Typography>
            )}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
