'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { ItemPhoto } from '@/app/(app)/ventas/ItemPhoto';
import { Loading } from '@/components/feedback/Loading';
import { Logo } from '@/components/layout/Logo';
import { DualAmount } from '@/components/money/DualAmount';
import { formatDate } from '@/lib/dates';
import { formatMoney, type MoneyCurrency } from '@/lib/money';
import { fetchPublicOrder, type PublicOrder, type PublicOrderResult } from '@/lib/share';

/** Same threshold as the login: after this long, explain that the free server is waking up. */
const SLOW_MS = 4000;

function Shell({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', px: 2, py: 3 }}>
      <Box sx={{ maxWidth: 560, mx: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <Logo height={44} />
        </Box>
        {children}
      </Box>
    </Box>
  );
}

function AmountLine({ label, amount, usd, crc, currency, strong = false }: {
  label: string; amount: number; usd: number; crc: number; currency: MoneyCurrency; strong?: boolean;
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Typography color="text.secondary">{label}</Typography>
      <DualAmount amount={amount} currency={currency} usd={usd} crc={crc} variant={strong ? 'h6' : 'body1'} fontWeight={strong ? 700 : 500} align="right" />
    </Stack>
  );
}

function OrderView({ order }: { order: PublicOrder }) {
  const t = order.totals;
  const paidOff = t.total > 0 && t.balance <= 0;
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ overflowWrap: 'anywhere' }}>
          Venta de {order.customerName}
        </Typography>
        <Typography color="text.secondary">
          {formatDate(order.date)}
          {order.tripName ? ` · ${order.tripName}` : ''}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Chip size="small" label={order.statusLabel} variant="outlined" />
          {t.total > 0 && (
            <Chip size="small" variant="outlined" color={paidOff ? 'success' : 'warning'} label={paidOff ? 'Pagado' : 'Saldo pendiente'} />
          )}
        </Stack>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <AmountLine label="Total" amount={t.total} usd={t.totalUsd} crc={t.totalCrc} currency={order.currency} />
            <AmountLine label="Abono" amount={t.paid} usd={t.paidUsd} crc={t.paidCrc} currency={order.currency} />
            <Divider />
            <AmountLine label="Saldo" amount={t.balance} usd={t.balanceUsd} crc={t.balanceCrc} currency={order.currency} strong />
          </Stack>
        </CardContent>
      </Card>

      <Box component="section">
        <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>Artículos</Typography>
        {order.items.length === 0 ? (
          <Typography color="text.secondary">Esta Venta todavía no tiene Artículos.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {order.items.map((item, index) => (
              <Card key={index} variant="outlined">
                <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <ItemPhoto url={item.photoUrl} alt={item.name} />
                  <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.quantity} × {formatMoney(item.price, order.currency)}
                      {item.size ? ` · Talla ${item.size}` : ''}
                    </Typography>
                  </Stack>
                  <DualAmount amount={item.lineTotal} currency={order.currency} usd={item.lineTotalUsd} crc={item.lineTotalCrc} align="right" sx={{ flexShrink: 0 }} />
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Box>

      <Box component="section">
        <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>Abonos</Typography>
        {order.payments.length === 0 ? (
          <Typography color="text.secondary">Todavía no hay Abonos.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {order.payments.map((payment, index) => (
              <Card key={index} variant="outlined">
                <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{formatDate(payment.date)}</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <DualAmount amount={payment.amount} currency={payment.currency} usd={payment.amountUsd} crc={payment.amountCrc} align="right" />
                    {payment.currency.code !== order.currency.code && (
                      <Typography variant="caption" color="text.secondary" component="p">
                        = {formatMoney(payment.orderAmount, order.currency)} de la Venta
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" align="center" component="p">
        ConKora · Los montos en otras monedas son aproximados.
      </Typography>
    </Stack>
  );
}

function PublicOrderContent({ token }: { token: string }) {
  const [result, setResult] = useState<PublicOrderResult | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    fetchPublicOrder(token, { onWaking: () => setSlow(true) }).then((r) => {
      if (active) setResult(r);
      clearTimeout(timer);
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token]);

  if (!result) {
    return slow ? (
      <Alert severity="info" icon={false} role="status">
        <AlertTitle>Despertando el servidor…</AlertTitle>
        El servidor se duerme cuando nadie lo usa; la primera visita puede tardar hasta un minuto. No cierres esta página.
        <LinearProgress sx={{ mt: 1.5 }} />
      </Alert>
    ) : (
      <Loading message="Cargando tu Venta…" />
    );
  }
  if (result.kind === 'ok') return <OrderView order={result.order} />;
  return <Unavailable kind={result.kind} />;
}

function Unavailable({ kind }: { kind: 'not-found' | 'rate-limited' | 'error' }) {
  const message = {
    'not-found': 'Este enlace no es válido o ya no está activo. Pide a ConKora un enlace nuevo.',
    'rate-limited': 'Demasiadas visitas seguidas. Espera un minuto y vuelve a cargar la página.',
    error: 'No pudimos cargar la Venta. Intenta de nuevo en un momento.',
  }[kind];
  return <Alert severity={kind === 'not-found' ? 'warning' : 'error'}>{message}</Alert>;
}

function PublicOrderRoute() {
  const token = useSearchParams().get('t');
  return token ? <PublicOrderContent token={token} /> : <Unavailable kind="not-found" />;
}

export default function PublicOrderPage() {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <PublicOrderRoute />
      </Suspense>
    </Shell>
  );
}
