import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** Page title with optional actions (e.g. a "Nuevo" button) aligned to the right. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
      <Typography variant="h4" component="h1" sx={{ flexGrow: 1, fontSize: { xs: '1.6rem', sm: '2rem' } }}>
        {title}
      </Typography>
      {actions}
    </Box>
  );
}
