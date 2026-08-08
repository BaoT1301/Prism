import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * A small, dependency-free confirmation dialog in the editorial design system.
 * Used to gate destructive/irreversible actions (delete account, regenerate a
 * join code, remove a roster member). Escape and a backdrop click both cancel;
 * the confirm button is focused on open so the flow is keyboard-complete.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTestId,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTestId?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={() => { if (!busy) onCancel(); }}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Please confirm</p>
        <h2 id={titleId}>{title}</h2>
        <div id={bodyId} className="confirm-body">{children}</div>
        <div className="confirm-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            type="button"
            ref={confirmRef}
            className={tone === "danger" ? "danger-button" : undefined}
            data-testid={confirmTestId}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
