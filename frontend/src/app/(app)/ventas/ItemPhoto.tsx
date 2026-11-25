'use client';

import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import { useState } from 'react';
import { thumbnailUrl } from '@/lib/photos';

/** Thumbnail of an Artículo photo; tap to enlarge. Renders nothing without a photo. */
export function ItemPhoto({ url, alt, size = 64 }: { url: string | null; alt: string; size?: number }) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      <Box
        component="img"
        src={thumbnailUrl(url, size * 2)}
        alt={alt}
        loading="lazy"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          setOpen(true);
        }}
        sx={{ width: size, height: size, objectFit: 'cover', borderRadius: 1, flexShrink: 0, cursor: 'zoom-in' }}
      />
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" onClick={(e) => e.stopPropagation()}>
        <Box component="img" src={url} alt={alt} onClick={() => setOpen(false)} sx={{ display: 'block', maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain' }} />
      </Dialog>
    </>
  );
}
