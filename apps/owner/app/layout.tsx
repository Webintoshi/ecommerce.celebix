import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { requireOwnerAuth } from "@/lib/owner-auth";
import { SidebarNavLink } from "@/components/SidebarNavLink";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Celebix Owner Panel",
  description: "Tum e-ticaret projelerini tek panelden yonet."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let auth: Awaited<ReturnType<typeof requireOwnerAuth>> | null = null;
  try {
    auth = await requireOwnerAuth();
  } catch {
    // Auth yoksa requireOwnerAuth zaten redirect eder.
  }

  const userName = auth?.profile.full_name || auth?.user.email || "";
  const roleLabel = auth?.profile.role === "super_admin" ? "Super Admin" : "Affiliate";

  return (
    <html lang="tr">
      <body className="owner-panel">
        <div className="app-shell">
          <aside className="sidebar">
            <div className="sidebar-header">
              <Link href="/" className="brand-lockup">
                <img 
                  src="https://celebix.co/Logo/koyu%20logo.svg" 
                  alt="Celebix" 
                  className="logo-img" 
                  style={{ filter: "brightness(0) invert(1)" }}
                />
                <div>
                  <strong>Celebix</strong>
                  <span>Owner Panel</span>
                </div>
              </Link>
            </div>
            <nav className="sidebar-nav">
              <div className="sidebar-group-label">Genel</div>
              <SidebarNavLink href="/" exact>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
                Dashboard
              </SidebarNavLink>
              <SidebarNavLink href="/stores">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7h18" />
                  <path d="M6 3h12l2 4H4z" />
                  <path d="M5 7h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
                </svg>
                Projeler
              </SidebarNavLink>
              <SidebarNavLink href="/stores/new">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Yeni Proje
              </SidebarNavLink>

              <div className="sidebar-group-label">Yonetim</div>
              <SidebarNavLink href="/clients">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Musteriler
              </SidebarNavLink>
              <SidebarNavLink href="/finance">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1v22" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                Finans
              </SidebarNavLink>
              <SidebarNavLink href="/operations">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20v-6" />
                  <path d="M18 20V10" />
                  <path d="M6 20v-3" />
                  <path d="M2 20h20" />
                </svg>
                Operasyon
              </SidebarNavLink>
              <SidebarNavLink href="/affiliates">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Affiliate
              </SidebarNavLink>
            </nav>
            <div className="sidebar-footer">
              <SignOutButton />
            </div>
          </aside>

          <div className="main-area">
            <header className="topbar" style={{ justifyContent: "flex-end" }}>
              <div className="topbar-user">
                <span className="pill pill-accent">{roleLabel}</span>
                <span style={{ color: "#2B2B2B", fontWeight: 600 }}>{userName}</span>
              </div>
            </header>
            <main className="page-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
