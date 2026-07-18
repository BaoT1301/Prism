export function SaveStatus({ status, message }: { status: "idle" | "saving" | "saved" | "error" | "conflict"; message?: string }) {
  const labels = { idle: "Ready", saving: "Saving...", saved: "Progress saved", error: "Unable to save progress", conflict: "Latest progress loaded" };
  return <p className={`save-status status-${status}`} role="status"><span aria-hidden="true" />{message ?? labels[status]}</p>;
}
