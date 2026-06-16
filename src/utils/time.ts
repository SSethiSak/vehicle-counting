/**
 * Returns the current local device time as "YYYY-MM-DD HH:mm:ss".
 * Replaces new Date().toISOString() which always returns UTC.
 */
export function localTimestamp(): string {
  const d   = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
