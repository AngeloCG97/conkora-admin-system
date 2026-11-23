import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { PageHeader } from './PageHeader';

/** Placeholder for sections not built yet. Delete its usage when the section is implemented. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography color="text.secondary">Esta sección estará disponible pronto.</Typography>
      </Paper>
    </>
  );
}
