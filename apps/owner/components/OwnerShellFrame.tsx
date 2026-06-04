"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { OwnerPreviewBanner } from "@/components/owner-control";
import { SidebarNavLink } from "@/components/SidebarNavLink";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/theme-toggle";

interface OwnerShellFrameProps {
  userName: string;
  roleLabel: string;
  previewTitle: string;
  previewMessage: string;
  showPreviewBanner: boolean;
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  exclude?: string[];
  icon: ReactNode;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Genel",
    items: [
      {
        href: "/",
        label: "Genel Bakış",
        exact: true,
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        )
      },
      {
        href: "/stores",
        label: "Mağazalar",
        exclude: ["/stores/new"],
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 7h18" />
            <path d="M6 3h12l2 4H4z" />
            <path d="M5 7h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
          </svg>
        )
      },
      {
        href: "/stores/new",
        label: "Yeni Mağaza",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        )
      }
    ]
  },
  {
    label: "Yönetim",
    items: [
      {
        href: "/clients",
        label: "Kullanıcılar",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        )
      },
      {
        href: "/finance",
        label: "Faturalar",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 1v22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        )
      },
      {
        href: "/operations",
        label: "Operasyonlar",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20v-6" />
            <path d="M18 20V10" />
            <path d="M6 20v-3" />
            <path d="M2 20h20" />
          </svg>
        )
      },
      {
        href: "/affiliates",
        label: "Affiliate Paneli",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        )
      }
    ]
  }
];

function resolveTopbarContext(pathname: string) {
  if (pathname === "/") {
    return { eyebrow: "Owner Panel", title: "Genel Bakış" };
  }

  if (pathname === "/stores/new") {
    return { eyebrow: "Kurulum Akışı", title: "Yeni Mağaza" };
  }

  if (pathname.startsWith("/stores/")) {
    return { eyebrow: "Mağazalar", title: "Mağaza Detayı" };
  }

  if (pathname === "/stores") {
    return { eyebrow: "Portföy", title: "Mağazalar" };
  }

  if (pathname === "/operations") {
    return { eyebrow: "Kontrol", title: "Operasyonlar" };
  }

  if (pathname === "/affiliates") {
    return { eyebrow: "Satış Ortakları", title: "Affiliate Paneli" };
  }

  if (pathname === "/clients") {
    return { eyebrow: "Yönetim", title: "Kullanıcılar" };
  }

  if (pathname === "/finance") {
    return { eyebrow: "Yönetim", title: "Faturalar" };
  }

  return { eyebrow: "Celebix", title: "Owner Panel" };
}

export function OwnerShellFrame({
  userName,
  roleLabel,
  previewTitle,
  previewMessage,
  showPreviewBanner,
  children,
}: OwnerShellFrameProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const context = useMemo(() => resolveTopbarContext(pathname), [pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className={`app-shell${drawerOpen ? " drawer-open" : ""}`}>
      <button
        type="button"
        className={`shell-backdrop${drawerOpen ? " is-visible" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-label="Menüyü kapat"
      />

      <aside id="owner-sidebar" className={`sidebar${drawerOpen ? " is-open" : ""}`}>
        <div className="sidebar-header">
          <Link href="/" className="brand-lockup">
            <div className="brand-logo-panel">
              <img src="https://celebix.net/Logo/koyu%20logo.svg" alt="Celebix" className="brand-logo" />
            </div>
            <div className="brand-caption">
              <span className="brand-kicker">Owner Panel</span>
              <strong>Premium kontrol paneli</strong>
              <span>Mağaza, kurulum ve affiliate yönetimi tek akışta.</span>
            </div>
          </Link>
        </div>

        <nav className="sidebar-nav" aria-label="Owner ana navigasyon">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="sidebar-group">
              <div className="sidebar-group-label">{section.label}</div>
              {section.items.map((item) => (
                <SidebarNavLink key={item.href} href={item.href} exact={item.exact} exclude={item.exclude}>
                  {item.icon}
                  {item.label}
                </SidebarNavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="shell-user-panel">
            <span className="shell-user-role">{roleLabel}</span>
            <strong>{userName || "Owner Kullanıcısı"}</strong>
            <small>Yazma ve kurulum aksiyonlarını bu panelden yönet.</small>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              type="button"
              className="shell-menu-button"
              onClick={() => setDrawerOpen((current) => !current)}
              aria-expanded={drawerOpen}
              aria-controls="owner-sidebar"
              aria-label={drawerOpen ? "Menüyü kapat" : "Menüyü aç"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="topbar-context">
              <span>{context.eyebrow}</span>
              <strong>{context.title}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            {showPreviewBanner ? <span className="pill pill-warning topbar-preview-pill">{previewTitle}</span> : null}
            <span className="pill pill-ink topbar-role-pill">{roleLabel}</span>
            <span className="topbar-user-name">{userName}</span>
            <ThemeToggle />
          </div>
        </header>

        <main className="page-content">
          {showPreviewBanner ? <OwnerPreviewBanner title={previewTitle} message={previewMessage} /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
