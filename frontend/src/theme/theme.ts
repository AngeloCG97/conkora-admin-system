'use client';

import { createTheme } from '@mui/material/styles';
import { brand } from './brand';

// Components use theme tokens (e.g. `color="primary"`, `bgcolor: 'accent.main'`), never raw hex.

declare module '@mui/material/styles' {
  interface Palette {
    accent: Palette['primary'];
  }
  interface PaletteOptions {
    accent?: PaletteOptions['primary'];
  }
}

/** Texto: Inter (cuerpo y detalles). Display: Space Grotesk (titulares y logotipo). Loaded in app/layout.tsx. */
const textFontFamily = 'var(--font-text), system-ui, sans-serif';
const displayFontFamily = 'var(--font-display), var(--font-text), system-ui, sans-serif';

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: { main: brand.coralCorazon, contrastText: '#FFFFFF' },
    secondary: { main: brand.verdeKora, contrastText: '#FFFFFF' },
    /** Arcilla: borders, dividers and small details. */
    accent: { main: brand.arcilla, contrastText: '#FFFFFF' },
    text: { primary: brand.tinta, secondary: 'rgba(32, 29, 26, 0.7)' },
    background: { default: brand.crema, paper: '#FFFDF9' },
    divider: 'rgba(176, 137, 104, 0.35)',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: textFontFamily,
    h1: { fontFamily: displayFontFamily, fontWeight: 700 },
    h2: { fontFamily: displayFontFamily, fontWeight: 700 },
    h3: { fontFamily: displayFontFamily, fontWeight: 700 },
    h4: { fontFamily: displayFontFamily, fontWeight: 700 },
    h5: { fontFamily: displayFontFamily, fontWeight: 700 },
    h6: { fontFamily: displayFontFamily, fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiAppBar: { defaultProps: { elevation: 0, color: 'inherit' } },
    MuiPaper: { styleOverrides: { outlined: { borderColor: 'rgba(176, 137, 104, 0.35)' } } },
    MuiTextField: { defaultProps: { fullWidth: true } },
  },
});
