import { type ReactNode, useState } from "react";

import { Notice } from "./AsyncState";
import { ConfirmDialog } from "./ConfirmDialog";

export function PrismBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="prism-brand" href="/#/welcome" aria-label="Prism home">
      <span className="prism-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!compact && <span>Prism</span>}
    </a>
  );
}

export function SessionExpired({ onSignOut }: { onSignOut: () => Promise<unknown> }) {
  return (
    <main className="system-message" role="alert" data-testid="session-expired">
      <PrismBrand />
      <p className="eyebrow">Session expired</p>
      <h1>Please sign in again.</h1>
      <p>Your secure session has ended. Sign in to pick up right where you left off.</p>
      <button type="button" onClick={() => void onSignOut()}>Sign in again</button>
    </main>
  );
}

/**
 * Irreversible account deletion, surfaced in the top chrome for both roles.
 * A confirm step gates the DELETE /me call; on success the caller's sign-out
 * runs so the user lands back on the public entry rather than a dead session.
 */
export function DeleteAccountControl({
  deleteAccount,
  onSignOut,
}: {
  deleteAccount: () => Promise<unknown>;
  onSignOut: () => Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const confirm = () => {
    setBusy(true);
    setError(undefined);
    void Promise.resolve(deleteAccount())
      .then(() => onSignOut())
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "We could not delete your account. Please try again.");
        setBusy(false);
      });
  };

  return (
    <>
      <button className="text-button danger-link" type="button" data-testid="delete-account" onClick={() => setConfirming(true)}>Delete account</button>
      <ConfirmDialog
        open={confirming}
        title="Delete your account?"
        confirmLabel="Delete account"
        confirmTestId="confirm-delete-account"
        tone="danger"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => { setConfirming(false); setError(undefined); }}
      >
        <p>This permanently removes your account, along with your classes, assignments, and saved work. This cannot be undone.</p>
        {error && <Notice error={error} />}
      </ConfirmDialog>
    </>
  );
}

export function AppShell({
  role,
  name,
  onSignOut,
  deleteAccount,
  children,
}: {
  role: "Teacher" | "Student";
  name?: string;
  onSignOut: () => Promise<unknown>;
  deleteAccount?: () => Promise<unknown>;
  children: ReactNode;
}) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <PrismBrand />
        <div className="topbar-context" aria-label="Current workspace">
          <span className="role-chip"><span aria-hidden="true" />{role} workspace</span>
          {name && <span className="profile-name">{name}</span>}
          {deleteAccount && <DeleteAccountControl deleteAccount={deleteAccount} onSignOut={onSignOut} />}
          <button className="text-button" type="button" onClick={() => void onSignOut()}>Log out</button>
        </div>
      </header>
      <main className="workspace">{children}</main>
    </div>
  );
}
