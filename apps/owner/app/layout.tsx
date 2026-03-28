import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { requireOwnerAuth } from "@/lib/owner-auth";
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

  return (
    <html lang="tr">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="sidebar-header">
              <Link href="/">
                <img
                  src="https://celebix.co/Logo/koyu%20logo.svg"
                  alt="Celebix"
                  className="logo-img"
                />
              </Link>
            </div>
            <nav className="sidebar-nav">
              <Link href="/" className="sidebar-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
                Dashboard
              </Link>
              <Link href="/stores/new" className="sidebar-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Yeni Proje
              </Link>
              <Link href="/affiliates" className="sidebar-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Affiliate
              </Link>
            </nav>
            <div className="sidebar-footer">
              <SignOutButton />
            </div>
          </aside>

          <div className="main-area">
            <header className="topbar">
              <div />
              <div className="topbar-user">
                <span>{userName}</span>
              </div>
            </header>
            <div className="page-content">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
