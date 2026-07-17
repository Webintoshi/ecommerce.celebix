import Link from "next/link";
import type { TenantContext } from "@celebix/saas-contracts";

import { LogoutButton } from "./LogoutButton";
import { PanelNavigation } from "./PanelNavigation";

const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  store_owner: "Mağaza sahibi",
  store_admin: "Mağaza yöneticisi",
  store_staff: "Mağaza ekibi",
});

export function PanelShell({ children, tenantContext }: { children: React.ReactNode; tenantContext: TenantContext }) {
  const role = ROLE_LABELS[tenantContext.membership.role] ?? "Yetkili üye";
  return (
    <div className="panel-shell hemenaku-shell">
      <aside className="panel-sidebar">
        <Link className="panel-brand" href="/" aria-label="Celebix Panel ana sayfa">
          <span className="panel-brand-mark">C</span>
          <span>
            <strong>Celebix</strong>
            <small>Merchant Panel</small>
          </span>
        </Link>

        <div className="store-identity" aria-label="Etkin mağaza">
          <span className="store-avatar" aria-hidden="true">{tenantContext.store.slug.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>
          <span>
            <strong>{tenantContext.store.slug}</strong>
            <small>{role}</small>
          </span>
          <span className="authority-lock" title="Sunucu tarafından doğrulandı" aria-label="Sunucu tarafından doğrulandı">●</span>
        </div>

        <PanelNavigation />

        <div className="sidebar-footer">
          <p><span aria-hidden="true">●</span> PostgreSQL doğrulamalı oturum</p>
        </div>
      </aside>

      <div className="panel-workspace">
        <header className="panel-header">
          <Link className="mobile-brand" href="/" aria-label="Celebix Panel ana sayfa">
            <span className="panel-brand-mark">C</span>
            <strong>Celebix</strong>
          </Link>
          <div className="header-store">
            <span>Etkin mağaza <b>· {role}</b></span>
            <strong>{tenantContext.store.slug}</strong>
          </div>
          <div className="header-session">
            <div className="header-role">
              <span>{role}</span>
              <span className="role-dot" aria-hidden="true" />
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="panel-content">{children}</main>
        <PanelNavigation mobile />
      </div>
    </div>
  );
}
