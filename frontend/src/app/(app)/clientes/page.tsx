'use client';

import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { gqlRequest } from '@/lib/graphql';
import { CUSTOMER_FIELDS, CustomerDialog, type Customer } from './CustomerDialog';
import { customerWhere } from './customers';

const CUSTOMERS_QUERY = `query Customers($where: customer_bool_exp!) {
  customer(where: $where, order_by: [{ name: asc }]) { ${CUSTOMER_FIELDS} }
}`;

export default function CustomersPage() {
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const where = customerWhere(search);
  const { data, isPending } = useQuery({
    queryKey: ['customers', where],
    queryFn: () => gqlRequest<{ customer: Customer[] }>(CUSTOMERS_QUERY, { where }),
    placeholderData: (previous) => previous,
  });

  return (
    <>
      <PageHeader
        title="Clientes"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            Nuevo Cliente
          </Button>
        }
      />
      <TextField
        label="Buscar por nombre o teléfono"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        size="small"
        sx={{ mb: 2 }}
        type="search"
      />
      {isPending ? (
        <Loading />
      ) : data?.customer.length === 0 ? (
        <Typography color="text.secondary">
          {search.trim() ? 'Ningún Cliente coincide con la búsqueda.' : 'Aún no hay Clientes. Crea el primero con «Nuevo Cliente».'}
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {data?.customer.map((c) => (
            <Card key={c.id} variant="outlined">
              <CardActionArea component={Link} href={`/clientes/detalle/?id=${c.id}`}>
                <CardContent>
                  <Typography sx={{ fontWeight: 600 }}>{c.name}</Typography>
                  {(c.phone || c.email) && (
                    <Typography variant="body2" color="text.secondary">
                      {[c.phone, c.email].filter(Boolean).join(' · ')}
                    </Typography>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
      {creating && <CustomerDialog onClose={() => setCreating(false)} />}
    </>
  );
}
