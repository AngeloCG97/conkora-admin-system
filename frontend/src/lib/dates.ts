/** Formats an ISO date (`2026-01-10`) as `10/01/2026` without going through `Date` (no timezone shifts). */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** `10/01/2026 – 15/01/2026` */
export function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Today's local date as ISO (`2026-01-10`), e.g. the default date of a new Gasto. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
