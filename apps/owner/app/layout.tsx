import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import "./globals.css";
import { getOwnerAuthContext } from "@/lib/owner-auth";
import { SidebarNavLink } from "@/components/SidebarNavLink";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const PUBLIC_SELF_SERVE_PAGE_PATHS = new Set([
  "/kayit",
  "/magaza-ac",
  "/onboarding",
  "/onboarding/status",
]);

function isPublicSelfServePagePath(pathname: string) {
  return PUBLIC_SELF_SERVE_PAGE_PATHS.has(pathname);
}

export const metadata: Metadata = {
  title: "Celebix Owner Panel",
  description: "Tum e-ticaret projelerini tek panelden yonet."
};

// Prevent FOUC (Flash of Unstyled Content) script
const themeScript = `
  (function() {
    function getThemePreference() {
      try {
        if (typeof localStorage !== 'undefined') {
          var stored = localStorage.getItem('owner-theme');
          if (stored === 'light' || stored === 'dark' || stored === 'system') {
            return stored;
          }
        }
      } catch (_) {
        return 'system';
      }
      return 'system';
    }

    var mode = getThemePreference();
    var prefersDark = false;

    try {
      prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {}

    var resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-mode', mode);
    document.documentElement.style.colorScheme = resolved;
  })();
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [auth, requestHeaders] = await Promise.all([getOwnerAuthContext(), headers()]);
  const pathname = requestHeaders.get("x-owner-pathname") ?? "/";
  const isPublicSelfServePage = isPublicSelfServePagePath(pathname);
  const shellAuth = isPublicSelfServePage ? null : auth;

  const userName = shellAuth?.profile.full_name || shellAuth?.user.email || "";
  const roleLabel = shellAuth?.profile.role === "super_admin" ? "Super Admin" : "Affiliate";

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="owner-panel" suppressHydrationWarning>
        <ThemeProvider defaultTheme="system" enableSystem disableTransitionOnChange={false}>
          {shellAuth ? (
            <div className="app-shell">
              <aside className="sidebar">
                <div className="sidebar-header">
                  <Link href="/">
                    <img src="/branding/celebix-logo.svg" alt="Celebix" className="brand-logo" />
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
                  <SidebarNavLink href="/owner/self-serve">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 5h16" />
                      <path d="M4 12h10" />
                      <path d="M4 19h7" />
                      <path d="m17 15 3 3-3 3" />
                    </svg>
                    Self-serve
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
                <header className="topbar">
                  <ThemeToggle />
                  <div className="topbar-user">
                    <span className="pill pill-accent">{roleLabel}</span>
                    <span className="topbar-user-name">{userName}</span>
                  </div>
                </header>
                <main className="page-content">{children}</main>
              </div>
            </div>
          ) : (
            children
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
