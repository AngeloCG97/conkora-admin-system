'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

/** Centered spinner for pages or sections that are loading data. */
export function Loading({ message, fullScreen = false }: { message?: string; fullScreen?: boolean }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        py: 6,
        minHeight: fullScreen ? '100dvh' : undefined,
      }}
    >
      <CircularProgress />
      {message && (
        <Typography color="text.secondary" align="center">
          {message}
        </Typography>
      )}
    </Box>
  );
}
