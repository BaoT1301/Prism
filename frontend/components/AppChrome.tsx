import type { ReactNode } from "react";

export function PrismBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="prism-brand" href="#/" aria-label="Prism home">
      <span className="prism-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!compact && <span>Prism</span>}
    </a>
  );
}

export function AppShell({
  role,
  name,
  onSignOut,
  children,
}: {
  role: "Teacher" | "Student";
  name?: string;
  onSignOut: () => Promise<unknown>;
  children: ReactNode;
}) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <PrismBrand />
        <div className="topbar-context" aria-label="Current workspace">
          <span className="role-chip"><span aria-hidden="true" />{role} workspace</span>
          {name && <span className="profile-name">{name}</span>}
          <button className="text-button" type="button" onClick={() => void onSignOut()}>Log out</button>
        </div>
      </header>
      <main className="workspace">{children}</main>
    </div>
  );
}
