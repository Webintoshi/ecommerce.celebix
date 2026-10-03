import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import "./globals.css";
import "./platform.css";
import { getPlatformOperator } from "@/lib/platform/auth";
import { SidebarNavLink } from "@/components/SidebarNavLink";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const publicPaths = new Set(["/kayit", "/magaza-ac", "/onboarding", "/onboarding/status"]);
const navigation = [
  { href: "/", label: "Özet", icon: "▦" },
  { href: "/stores", label: "Mağazalar", icon: "▤" },
  { href: "/plans", label: "Paketler", icon: "◈" },
  { href: "/finance", label: "Abonelik ve Finans", icon: "₺" },
  { href: "/operations", label: "Operasyonlar", icon: "↻" },
  { href: "/settings", label: "Ayarlar ve Geçmiş", icon: "⚙" },
];
export const metadata: Metadata = { title: "Celebix Platform Yönetimi", description: "Mağazalar, paketler ve platform hizmet finansını yönetin." };

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
  const [operator, requestHeaders] = await Promise.all([getPlatformOperator(), headers()]);
  const pathname = requestHeaders.get("x-owner-pathname") ?? "/";
  const shellOperator = publicPaths.has(pathname) ? null : operator;
  return <html lang="tr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body className="owner-panel" suppressHydrationWarning><ThemeProvider defaultTheme="system" enableSystem disableTransitionOnChange={false}>
    {shellOperator ? <div className="app-shell platform-shell">
      <a href="#platform-main" className="platform-skip-link">İçeriğe geç</a>
      <aside className="sidebar"><div className="sidebar-header"><Link href="/" aria-label="Celebix özet"><img src="/branding/celebix-logo.svg" alt="Celebix" className="brand-logo" /></Link></div><nav className="sidebar-nav" aria-label="Platform yönetimi"><div className="sidebar-group-label">Platform</div>{navigation.map(item => <SidebarNavLink key={item.href} href={item.href} exact={item.href === "/"}><span className="platform-nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</SidebarNavLink>)}</nav><div className="sidebar-footer"><SignOutButton /></div></aside>
      <div className="main-area"><header className="topbar"><ThemeToggle /><div className="topbar-user"><span className="pill pill-accent">Platform sahibi</span><span className="topbar-user-name">{shellOperator.label || shellOperator.email}</span></div><div className="platform-mobile-signout"><SignOutButton /></div></header><main className="page-content" id="platform-main" tabIndex={-1}>{children}</main></div>
    </div> : children}
  </ThemeProvider></body></html>;
}
