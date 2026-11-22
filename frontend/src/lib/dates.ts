/** Formats an ISO date (`2026-01-10`) as `10/01/2026` without going through `Date` (no timezone shifts). */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** `10/01/2026 – 15/01/2026` */
export function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}
