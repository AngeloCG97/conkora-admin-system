import Box from '@mui/material/Box';
import { assetPath } from '@/lib/config';

/** ConKora logo, versión tinta (public/logo-tinta.svg). */
export function Logo({ height = 40 }: { height?: number }) {
  return (
    <Box
      component="img"
      src={assetPath('/logo-tinta.svg')}
      alt="ConKora"
      sx={{ height, width: 'auto', display: 'block' }}
    />
  );
}
