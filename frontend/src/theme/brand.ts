/**
 * ConKora brand palette (the only place with raw hex values besides theme.ts).
 * Kept apart from theme.ts, which is a client module, so server code (layout metadata) can import it.
 */
export const brand = {
  coralCorazon: '#E35D47',
  verdeKora: '#7D9A76',
  tinta: '#201D1A',
  crema: '#F4EFE6',
  arcilla: '#B08968',
} as const;
