import Link from "next/link";
import type { PanelSession } from "@/lib/session";
import { StoreSelector } from "@/components/StoreSelector";

export function PanelShell({ children, session }: { children: React.ReactNode; session: PanelSession }) {
  return (
    <div className="panel-shell">
      <aside className="panel-sidebar">
        <Link className="brand" href="/" aria-label="Celebix Panel ana sayfa">
          <span className="brand-mark">X</span>
          <span>Celebix Panel</span>
        </Link>
        <StoreSelector stores={[]} activeStoreId={session.activeStoreId} />
        <nav aria-label="Panel menüsü">
          <Link href="/">Özet</Link>
          <Link href="/setup">Kurulum durumu</Link>
        </nav>
        <form action="/auth/logout" method="post">
          <button className="logout" type="submit">Çıkış yap</button>
        </form>
      </aside>
      <div className="panel-workspace">
        <header className="panel-header">
          <div>
            <strong>Mağaza yönetimi</strong>
            <span>Güvenli müşteri paneli temeli</span>
          </div>
          <span className="principal-id">{session.principal.id}</span>
        </header>
        <main className="panel-content">{children}</main>
      </div>
    </div>
  );
}
