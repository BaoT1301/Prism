/**
 * Small, dependency-free formatters shared by the teacher analytics/review and
 * student feedback views. Each one is defensive: a missing or malformed value
 * degrades to a readable fallback rather than rendering `NaN`/`Invalid Date`.
 */

/** Formats an ISO timestamp as a medium date + short time, or `fallback` when absent/unparseable. */
export function formatDateTime(value?: string | null, fallback = "—"): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

/** Formats a whole number of seconds as "Xm Ys"; `null`/non-finite becomes "—". */
export function formatDuration(seconds?: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}m ${secs}s`;
}
