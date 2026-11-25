import Box from '@mui/material/Box';
import { assetPath } from '@/lib/config';

/**
 * ConKora wordmark (public/logo-conkora.svg): "con kora" in Space Grotesk outlines, with the "o" of
 * "kora" drawn as a coral heart. Wide (~6:1), so it shrinks to fit its container instead of overflowing.
 * PWA icons are still generated from public/logo-tinta.svg (`npm run icons`).
 */
export function Logo({ height = 40 }: { height?: number }) {
  return (
    <Box
      component="img"
      src={assetPath('/logo-conkora.svg')}
      alt="ConKora"
      sx={{ height, width: 'auto', maxWidth: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
}
