'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useConfirm, useNotify } from '@/components/feedback/FeedbackProvider';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { GraphQLRequestError, gqlRequest } from '@/lib/graphql';
import { CUSTOMER_FIELDS, CustomerDialog, type Customer } from '../CustomerDialog';

const CUSTOMER_QUERY = `query Customer($id: uuid!) {
  customer_by_pk(id: $id) { ${CUSTOMER_FIELDS} }
}`;

const DELETE_CUSTOMER = `mutation DeleteCustomer($id: uuid!) { delete_customer_by_pk(id: $id) { id } }`;

function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => gqlRequest<{ customer_by_pk: Customer | null }>(CUSTOMER_QUERY, { id }),
  });

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_CUSTOMER, { id }),
    onSuccess: () => {
      notify.success('Cliente eliminado');
      qc.removeQueries({ queryKey: ['customer', id] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      router.push('/clientes/');
    },
    onError: (e) =>
      notify.error(
        e instanceof GraphQLRequestError && e.code === 'constraint-violation'
          ? 'No se puede eliminar: el Cliente tiene Pedidos'
          : 'No se pudo eliminar',
      ),
  });

  const onDelete = async () => {
    if (await confirm({ title: '¿Eliminar el Cliente?', message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true })) {
      remove.mutate();
    }
  };

  if (isPending) return <Loading />;
  const customer = data?.customer_by_pk;
  if (!customer) {
    return (
      <>
        <PageHeader title="Cliente no encontrado" />
        <Button component={Link} href="/clientes/" startIcon={<ArrowBackIcon />}>
          Volver a Clientes
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={customer.name}
        actions={
          <Stack direction="row" spacing={1}>
            <IconButton aria-label="Editar Cliente" onClick={() => setEditing(true)}>
              <EditIcon />
            </IconButton>
            <IconButton aria-label="Eliminar Cliente" color="error" onClick={onDelete} disabled={remove.isPending}>
              <DeleteIcon />
            </IconButton>
          </Stack>
        }
      />
      <Button component={Link} href="/clientes/" startIcon={<ArrowBackIcon />} sx={{ mb: 2, mt: -2 }}>
        Clientes
      </Button>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="body2" color="text.secondary">Teléfono</Typography>
          <Typography sx={{ mb: 1.5 }}>{customer.phone ?? '—'}</Typography>
          <Typography variant="body2" color="text.secondary">Correo</Typography>
          <Typography sx={{ mb: 1.5, overflowWrap: 'anywhere' }}>{customer.email ?? '—'}</Typography>
          {customer.notes && (
            <>
              <Typography variant="body2" color="text.secondary">Notas</Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{customer.notes}</Typography>
            </>
          )}
        </CardContent>
      </Card>

      {editing && <CustomerDialog customer={customer} onClose={() => setEditing(false)} />}
    </>
  );
}

function CustomerDetailRoute() {
  const id = useSearchParams().get('id');
  if (!id) return <PageHeader title="Cliente no encontrado" />;
  return <CustomerDetail id={id} />;
}

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CustomerDetailRoute />
    </Suspense>
  );
}
