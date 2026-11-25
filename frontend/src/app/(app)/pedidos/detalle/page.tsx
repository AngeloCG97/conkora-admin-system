'use client';

import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MoveDownIcon from '@mui/icons-material/MoveDown';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardActions from '@mui/material/CardActions';
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
import { formatDate } from '@/lib/dates';
import { gqlRequest } from '@/lib/graphql';
import { NO_TRIP_LABEL } from '@/lib/terms';
import { ItemPhoto } from '../../ventas/ItemPhoto';
import { ORDER_OPTIONS_QUERY, type OrderOptions } from '../../ventas/OrderDialog';
import { MoveToOrderDialog } from '../MoveToOrderDialog';
import { REQUEST_FIELDS, RequestDialog, type CustomerRequest } from '../RequestDialog';
import { REQUEST_ITEM_FIELDS, RequestItemDialog, type RequestItem } from '../RequestItemDialog';

type RequestDetail = CustomerRequest & {
  customer: { name: string };
  trip: { name: string } | null;
  items: RequestItem[];
};

const REQUEST_QUERY = `query Request($id: uuid!) {
  customer_request_by_pk(id: $id) {
    ${REQUEST_FIELDS}
    customer { name }
    trip { name }
    items(order_by: [{ created_at: asc }]) { ${REQUEST_ITEM_FIELDS} }
  }
}`;

const DELETE_REQUEST = `mutation DeleteRequest($id: uuid!) { delete_customer_request_by_pk(id: $id) { id } }`;

function RequestDetailView({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [itemEditing, setItemEditing] = useState<RequestItem | 'new' | null>(null);
  const [moving, setMoving] = useState<RequestItem | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ['request', id],
    queryFn: () => gqlRequest<{ customer_request_by_pk: RequestDetail | null }>(REQUEST_QUERY, { id }),
  });
  const options = useQuery({
    queryKey: ['order-options'],
    queryFn: () => gqlRequest<OrderOptions>(ORDER_OPTIONS_QUERY),
  });

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_REQUEST, { id }),
    onSuccess: () => {
      notify.success('Pedido eliminado');
      qc.removeQueries({ queryKey: ['request', id] });
      qc.invalidateQueries({ queryKey: ['requests'] });
      router.push('/pedidos/');
    },
    onError: () => notify.error('No se pudo eliminar'),
  });

  const onDelete = async () => {
    if (
      await confirm({
        title: '¿Eliminar el Pedido?',
        message: 'También se eliminarán sus Artículos. Esta acción no se puede deshacer.',
        confirmText: 'Eliminar',
        danger: true,
      })
    ) {
      remove.mutate();
    }
  };

  if (isPending) return <Loading />;
  const request = data?.customer_request_by_pk;
  if (!request) {
    return (
      <>
        <PageHeader title="Pedido no encontrado" />
        <Button component={Link} href="/pedidos/" startIcon={<ArrowBackIcon />}>
          Volver a Pedidos
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Pedido de ${request.customer.name}`}
        actions={
          <Stack direction="row" spacing={1}>
            <IconButton aria-label="Editar Pedido" onClick={() => setEditing(true)} disabled={!options.data}>
              <EditIcon />
            </IconButton>
            <IconButton aria-label="Eliminar Pedido" color="error" onClick={onDelete} disabled={remove.isPending}>
              <DeleteIcon />
            </IconButton>
          </Stack>
        }
      />
      <Button component={Link} href="/pedidos/" startIcon={<ArrowBackIcon />} sx={{ mb: 2, mt: -2 }}>
        Pedidos
      </Button>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">Cliente</Typography>
          <Typography sx={{ mb: 1.5 }}>
            <Link href={`/clientes/detalle/?id=${request.customer_id}`}>{request.customer.name}</Link>
          </Typography>
          <Typography variant="body2" color="text.secondary">Viaje</Typography>
          <Typography sx={{ mb: 1.5 }}>
            {request.trip ? (
              <Link href={`/viajes/detalle/?id=${request.trip_id}`}>{request.trip.name}</Link>
            ) : (
              NO_TRIP_LABEL
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary">Fecha</Typography>
          <Typography sx={{ mb: request.notes ? 1.5 : 0 }}>{formatDate(request.date)}</Typography>
          {request.notes && (
            <>
              <Typography variant="body2" color="text.secondary">Notas</Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{request.notes}</Typography>
            </>
          )}
        </CardContent>
      </Card>

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h6" component="h2">
          Artículos
        </Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setItemEditing('new')}>
          Agregar Artículo
        </Button>
      </Stack>
      {request.items.length === 0 ? (
        <Typography color="text.secondary">Este Pedido no tiene Artículos pendientes de encontrar.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {request.items.map((item) => (
            <Card key={item.id} variant="outlined">
              <CardActionArea onClick={() => setItemEditing(item)}>
                <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', pb: 1 }}>
                  <ItemPhoto url={item.photo_url} alt={item.name} />
                  <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.name}</Typography>
                    {item.size && (
                      <Typography variant="body2" color="text.secondary">
                        Talla {item.size}
                      </Typography>
                    )}
                    {item.description && (
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                        {item.description}
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </CardActionArea>
              <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                <Button size="small" startIcon={<MoveDownIcon />} onClick={() => setMoving(item)}>
                  Mover a Venta
                </Button>
              </CardActions>
            </Card>
          ))}
        </Stack>
      )}

      {editing && options.data && (
        <RequestDialog request={request} options={options.data} onClose={() => setEditing(false)} />
      )}
      {itemEditing && (
        <RequestItemDialog
          key={itemEditing === 'new' ? 'new' : itemEditing.id}
          requestId={id}
          item={itemEditing === 'new' ? undefined : itemEditing}
          onClose={() => setItemEditing(null)}
        />
      )}
      {moving && (
        <MoveToOrderDialog
          key={moving.id}
          requestId={id}
          customerId={request.customer_id}
          tripId={request.trip_id}
          tripName={request.trip?.name ?? null}
          item={moving}
          onClose={() => setMoving(null)}
        />
      )}
    </>
  );
}

function RequestDetailRoute() {
  const id = useSearchParams().get('id');
  if (!id) return <PageHeader title="Pedido no encontrado" />;
  return <RequestDetailView id={id} />;
}

export default function RequestDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RequestDetailRoute />
    </Suspense>
  );
}
