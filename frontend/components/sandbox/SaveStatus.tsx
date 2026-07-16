export function SaveStatus({ status, message }: { status: "idle" | "saving" | "saved" | "error" | "conflict"; message?: string }) {
  return <p role="status">{message ?? ({ idle: "Not changed", saving: "Saving…", saved: "Saved", error: "Unable to save progress", conflict: "Progress changed elsewhere; latest version loaded" }[status])}</p>;
}
