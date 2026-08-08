import type { ReactNode } from "react";

export function Notice({ error }: { error?: string }) {
  return error ? <p className="notice" role="alert">{error}</p> : null;
}

export function Loading({ label = "Loading your workspace..." }: { label?: string }) {
  return <div className="content-loading" role="status" aria-live="polite"><span aria-hidden="true" /><p>{label}</p></div>;
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><span aria-hidden="true">—</span><div><h3>{title}</h3><p>{children}</p></div></div>;
}

/** Content-shaped placeholder shown during the first load to avoid an empty-state flash. */
export function Skeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={`skeleton-grid ${className ?? ""}`.trim()} role="status" aria-live="polite" aria-busy="true" data-testid="skeleton">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, index) => <span className="skeleton-card" key={index} aria-hidden="true" />)}
    </div>
  );
}

/**
 * Single place that resolves the loading / error / empty / content decision so
 * Student and Teacher views render these states identically. `loading` wins,
 * then `error`, then `isEmpty`, otherwise the children.
 */
export function AsyncState({
  loading,
  error,
  isEmpty,
  loadingLabel,
  skeleton,
  empty,
  children,
}: {
  loading: boolean;
  error?: string;
  isEmpty?: boolean;
  loadingLabel?: string;
  skeleton?: ReactNode;
  empty?: ReactNode;
  children: ReactNode;
}) {
  if (loading) return <>{skeleton ?? <Loading label={loadingLabel} />}</>;
  if (error) return <Notice error={error} />;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
