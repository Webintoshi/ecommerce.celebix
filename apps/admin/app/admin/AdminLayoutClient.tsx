"use client";

import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Home, Menu, Package, RefreshCw, Sparkles, Store, Tag } from "lucide-react";
import { AdminClientBoundary } from "@/components/admin/AdminClientBoundary";
import { AdminNotificationCenter } from "@/components/admin/AdminNotificationCenter";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import ToshiAssistant from "@/components/admin/ToshiAssistant";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { cn } from "@/lib/utils";
import type { InitialAdminProfile } from "@/lib/admin-data-types";

type MobileSurface = "sidebar" | "notifications" | "toshi" | null;

function getShellMeta(pathname: string) {
  if (pathname.startsWith("/admin/siparisler")) {
    return {
      title: "Siparişler",
      subtitle: "Sipariş, ödeme ve teslimat akışını yönetin.",
    };
  }

  if (pathname.startsWith("/admin/urunler")) {
    return {
      title: "Ürünler",
      subtitle: "Katalog, koleksiyon ve feed akışlarını yönetin.",
    };
  }

  if (pathname.startsWith("/admin/musteriler")) {
    return {
      title: "Müşteriler",
      subtitle: "Müşteri kayıtları ve segmentler burada.",
    };
  }

  if (pathname.startsWith("/admin/analizler")) {
    return {
      title: "Analizler",
      subtitle: "KPI ve operasyon metriklerini izleyin.",
    };
  }

  if (pathname.startsWith("/admin/cms")) {
    return {
      title: "İçerik",
      subtitle: "Blog, sayfa ve politika akışlarını yönetin.",
    };
  }

  if (pathname.startsWith("/admin/ayarlar")) {
    return {
      title: "Ayarlar",
      subtitle: "Mağaza ve cihaz ayarları burada.",
    };
  }

  return {
    title: "Yönetim paneli",
    subtitle: "Ortak kontrol merkezi.",
  };
}

function isAdminRoot(pathname: string) {
  return pathname === "/admin" || pathname === "/admin/";
}

function getAdminDisplayName(profile: InitialAdminProfile | null) {
  const explicitName = profile?.fullName?.trim();

  if (explicitName) {
    return explicitName;
  }

  const emailPrefix = profile?.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();

  return emailPrefix
    ? emailPrefix.replace(/\b\w/g, (char) => char.toLocaleUpperCase("tr"))
    : "Admin";
}

function getInitials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);

  return (parts.length > 0 ? parts : ["A"])
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr"))
    .join("");
}

function DesktopTopbar({
  title,
  subtitle,
  profile,
  isDashboardRoot,
  isToshiOpen,
  toshiAlertCount,
  isNotificationsOpen,
  onNotificationsOpenChange,
  onUnreadCountChange,
  onRefresh,
  onToggleToshi,
}: {
  title: string;
  subtitle: string;
  profile: InitialAdminProfile | null;
  isDashboardRoot: boolean;
  isToshiOpen: boolean;
  toshiAlertCount?: number;
  isNotificationsOpen: boolean;
  onNotificationsOpenChange: (next: boolean) => void;
  onUnreadCountChange: (count: number) => void;
  onRefresh: () => void;
  onToggleToshi: () => void;
}) {
  const displayName = getAdminDisplayName(profile);
  const initials = getInitials(displayName);

  if (isDashboardRoot) {
    return (
      <header className="sticky top-0 z-30 mx-auto mb-5 hidden w-full bg-[var(--admin-bg)] min-[1025px]:block">
        <div id="admin-dashboard-topbar-actions" className="bg-[var(--admin-bg)]" />
      </header>
    );
  }

  return (
    <header className="sticky top-3 z-30 mx-auto mb-3 hidden w-full max-w-[1560px] min-[1025px]:block">
      <div className="rounded-[18px] border border-[var(--admin-border)] bg-[rgba(255,255,255,0.94)] px-3.5 py-2.5 shadow-[0_14px_28px_rgba(17,24,39,0.05)] backdrop-blur-xl 2xl:px-5">
        <div className="flex min-h-[48px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-text-muted)]">
              Ortak admin
            </p>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <h1 className="truncate text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--admin-heading)] xl:text-[1.12rem]">
                {title}
              </h1>
              <span className="hidden rounded-full border border-[var(--admin-success-soft)] bg-[var(--admin-success-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--admin-success)] 2xl:inline-flex">
                Sağlıklı
              </span>
            </div>
            <p className="mt-1 hidden truncate text-[13px] text-[var(--admin-text-secondary)] xl:block">{subtitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!isDashboardRoot ? (
              <a
                href={STORE_RUNTIME.storefrontUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden min-h-10 items-center gap-2 rounded-[14px] border border-[var(--admin-border)] bg-white px-3 text-sm font-semibold text-[var(--admin-text)] shadow-[var(--shadow-xs)] transition-colors hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)] 2xl:inline-flex"
              >
                <Store className="h-4 w-4" />
                Mağazayı görüntüle
                <ExternalLink className="h-3.5 w-3.5 text-[var(--admin-text-muted)]" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-[var(--shadow-xs)] transition-colors hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]"
              aria-label="Sayfayı yenile"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <AdminNotificationCenter
              isMobile={false}
              isOpen={isNotificationsOpen}
              onOpenChange={onNotificationsOpenChange}
              onUnreadCountChange={onUnreadCountChange}
            />
            <button
              type="button"
              onClick={onToggleToshi}
              aria-pressed={isToshiOpen}
              aria-label="Toshi asistanını aç"
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-[14px] border px-3 text-sm font-semibold shadow-[var(--shadow-xs)] transition-colors",
                isToshiOpen
                  ? "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]"
                  : "border-[var(--admin-border)] bg-white text-[var(--admin-text)] hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]",
              )}
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden xl:inline">Toshi</span>
              {toshiAlertCount && toshiAlertCount > 0 ? (
                <span className="rounded-full bg-[var(--admin-heading)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {toshiAlertCount > 9 ? "9+" : toshiAlertCount}
                </span>
              ) : null}
            </button>
            <div className="flex min-h-10 items-center gap-2 rounded-[14px] border border-[var(--admin-border)] bg-white px-2 shadow-[var(--shadow-xs)]">
              <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-[var(--admin-heading)] text-[12px] font-bold text-white">
                {initials}
              </span>
              <span className="hidden max-w-[9rem] truncate pr-1 text-sm font-semibold text-[var(--admin-heading)] 2xl:inline">
                {displayName}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileDockButton({
  icon: Icon,
  label,
  active,
  onClick,
  ariaControls,
  ariaExpanded,
  ariaHaspopup,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  ariaControls?: string;
  ariaExpanded?: boolean;
  ariaHaspopup?: "dialog";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      className={cn(
        "group relative flex flex-1 items-center justify-center px-[0.1rem] py-1 text-[var(--admin-text-secondary)] transition-all duration-200 ease-out active:scale-[0.985] focus-visible:outline-none",
        active ? "text-[var(--admin-accent-hover)]" : "text-[var(--admin-text-secondary)]",
      )}
    >
      <span
        className={cn(
          "relative flex min-h-[56px] w-full max-w-[4.05rem] flex-col items-center justify-center gap-[0.24rem] rounded-[1rem] border border-transparent px-2 py-2.5 transition-all duration-200 ease-out group-active:scale-[0.98]",
          active
            ? "border-[var(--admin-accent-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,241,232,0.92)_100%)] shadow-[0_10px_18px_rgba(17,24,39,0.06),inset_0_1px_0_rgba(255,255,255,0.82)]"
            : "bg-transparent group-active:bg-white/35",
        )}
      >
        <span
          className={cn(
            "pointer-events-none absolute inset-x-[1.05rem] top-[0.45rem] h-px bg-[linear-gradient(90deg,rgba(255,106,0,0)_0%,rgba(255,106,0,0.42)_50%,rgba(255,106,0,0)_100%)] transition-opacity duration-200 ease-out",
            active ? "opacity-100" : "opacity-0",
          )}
        />
        <Icon
          className={cn(
            "h-[1.12rem] w-[1.12rem] transition-all duration-200 ease-out",
            active ? "opacity-100 scale-100" : "opacity-[0.78] scale-[0.95]",
          )}
        />
        <span
          className={cn(
            "text-[10.5px] font-semibold tracking-[0.01em] transition-all duration-200 ease-out",
            active ? "opacity-100" : "opacity-[0.8]",
          )}
        >
          {label}
        </span>
      </span>
    </button>
  );
}

export default function AdminLayoutClient({
  children,
  initialProfile,
}: {
  children: ReactNode;
  initialProfile: InitialAdminProfile | null;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isMobile, setIsMobile] = useState(false);
  const [activeMobileSurface, setActiveMobileSurface] = useState<MobileSurface>(null);
  const [desktopToshiOpen, setDesktopToshiOpen] = useState(false);
  const [desktopNotificationsOpen, setDesktopNotificationsOpen] = useState(false);
  const [, setNotificationUnreadCount] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [toshiAlertInfo, setToshiAlertInfo] = useState<{
    count: number;
    summary: string;
  } | null>(null);

  const shellMeta = useMemo(() => getShellMeta(pathname), [pathname]);
  const rootAdmin = useMemo(() => isAdminRoot(pathname), [pathname]);
  const isOrdersRoute = pathname.startsWith("/admin/siparisler");
  const isProductsRoute = pathname.startsWith("/admin/urunler");
  const isSidebarOpen = isMobile ? activeMobileSurface === "sidebar" : false;
  const isNotificationsOpen = isMobile ? activeMobileSurface === "notifications" : desktopNotificationsOpen;
  const isToshiOpen = isMobile ? activeMobileSurface === "toshi" : desktopToshiOpen;
  const activeDockItem = isToshiOpen
    ? "toshi"
    : isSidebarOpen
      ? "menu"
      : rootAdmin
        ? "home"
        : isOrdersRoute
          ? "orders"
          : isProductsRoute
            ? "products"
            : pathname.startsWith("/admin")
              ? "menu"
              : null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1024px)");
    const syncMobileState = () => setIsMobile(mediaQuery.matches);

    syncMobileState();
    mediaQuery.addEventListener("change", syncMobileState);
    return () => mediaQuery.removeEventListener("change", syncMobileState);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setActiveMobileSurface(null);
      setKeyboardInset(0);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!rootAdmin) {
      return;
    }

    setDesktopToshiOpen(false);
    if (activeMobileSurface === "toshi") {
      setActiveMobileSurface(null);
    }
  }, [activeMobileSurface, rootAdmin]);

  useEffect(() => {
    if (!isMobile || typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    const syncViewportInset = () => {
      const nextInset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      setKeyboardInset(nextInset);
    };

    syncViewportInset();
    viewport.addEventListener("resize", syncViewportInset);
    viewport.addEventListener("scroll", syncViewportInset);
    return () => {
      viewport.removeEventListener("resize", syncViewportInset);
      viewport.removeEventListener("scroll", syncViewportInset);
    };
  }, [isMobile]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.dataset.adminMobileShell = isMobile ? "true" : "false";
    return () => {
      delete document.body.dataset.adminMobileShell;
    };
  }, [isMobile]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    if (isMobile && activeMobileSurface) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeMobileSurface, isMobile]);

  useEffect(() => {
    if (isMobile) {
      setActiveMobileSurface(null);
      return;
    }

    setDesktopNotificationsOpen(false);
  }, [isMobile, pathname]);

  const handleBack = () => {
    router.back();
  };

  const handleHome = () => {
    setActiveMobileSurface(null);
    setDesktopNotificationsOpen(false);
    setDesktopToshiOpen(false);
    router.push("/admin");
  };

  const handleOrders = () => {
    setActiveMobileSurface(null);
    setDesktopNotificationsOpen(false);
    setDesktopToshiOpen(false);
    router.push("/admin/siparisler");
  };

  const handleProducts = () => {
    setActiveMobileSurface(null);
    setDesktopNotificationsOpen(false);
    setDesktopToshiOpen(false);
    router.push("/admin/urunler");
  };

  const handleRefresh = () => {
    router.refresh();
  };

  const handleToggleMenu = () => {
    if (isMobile) {
      setActiveMobileSurface((current) => (current === "sidebar" ? null : "sidebar"));
    }
  };

  const handleToggleToshi = () => {
    if (isMobile) {
      setActiveMobileSurface((current) => (current === "toshi" ? null : "toshi"));
      return;
    }

    setDesktopNotificationsOpen(false);
    setDesktopToshiOpen((current) => !current);
  };

  const handleNotificationsOpenChange = (next: boolean) => {
    if (isMobile) {
      setActiveMobileSurface(next ? "notifications" : null);
      return;
    }

    setDesktopNotificationsOpen(next);
    if (next) {
      setDesktopToshiOpen(false);
    }
  };

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const shellStyle = {
    "--admin-mobile-keyboard-offset": `${keyboardInset}px`,
    "--admin-mobile-panel-top": "calc(env(safe-area-inset-top, 0px) + 6.35rem)",
    "--admin-mobile-panel-bottom":
      "max(calc(env(safe-area-inset-bottom, 0px) + 6.9rem), calc(var(--admin-mobile-keyboard-offset) + 1rem))",
    "--admin-mobile-dock-floor": "max(calc(env(safe-area-inset-bottom, 0px) + 0.3rem), 0.3rem)",
    "--admin-mobile-content-bottom":
      "max(calc(env(safe-area-inset-bottom, 0px) + 8.35rem), calc(var(--admin-mobile-keyboard-offset) + 1.75rem))",
  } as CSSProperties;

  return (
    <div
      className={cn(
        "bg-[var(--admin-bg)] font-sans",
        isMobile
          ? "flex h-dvh min-h-dvh overflow-hidden"
          : "flex min-h-screen overflow-visible",
      )}
      style={shellStyle}
    >
      <AdminClientBoundary
        name="AdminSidebar"
        fallback={
          <div className="hidden h-dvh min-h-dvh w-[13.75rem] shrink-0 border-l border-[var(--admin-border)] bg-white min-[1025px]:block xl:w-[14.25rem] 2xl:w-[15.25rem]" />
        }
      >
        <AdminSidebar
          isOpen={isSidebarOpen}
          onClose={() => setActiveMobileSurface(null)}
          initialProfile={initialProfile}
        />
      </AdminClientBoundary>

      <main
        className={cn(
          "min-w-0 flex-1",
          isMobile ? "min-h-0 overflow-y-auto overscroll-y-contain" : "overflow-visible",
        )}
      >
        <div
          className={cn(
            "px-3.5 pb-[var(--admin-mobile-content-bottom)] pt-2 min-[1025px]:px-4 min-[1025px]:pb-5 min-[1025px]:pt-4 xl:px-5 xl:pb-5 xl:pt-5 2xl:px-6",
            isMobile ? "min-h-full" : "",
          )}
        >
          {isMobile && !rootAdmin ? (
          <div className="sticky top-[max(0.45rem,env(safe-area-inset-top))] z-30 mb-2 rounded-[20px] border border-[var(--admin-border)] bg-[rgba(255,255,255,0.94)] px-3 py-2.5 shadow-[var(--shadow-xs)] backdrop-blur-xl min-[1025px]:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]"
                    aria-label="Geri git"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>

                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-text-muted)]">
                    Modül
                  </p>
                  <h1
                    className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--admin-heading)] md:text-base"
                    title={shellMeta.subtitle}
                  >
                    {shellMeta.title}
                  </h1>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <AdminNotificationCenter
                  isMobile={isMobile}
                  isOpen={isNotificationsOpen}
                  onOpenChange={handleNotificationsOpenChange}
                  onUnreadCountChange={setNotificationUnreadCount}
                />
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]"
                  aria-label="Sayfayı yenile"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          ) : null}

          {!isMobile ? (
            <DesktopTopbar
              title={shellMeta.title}
              subtitle={shellMeta.subtitle}
              profile={initialProfile}
              isDashboardRoot={rootAdmin}
              isToshiOpen={isToshiOpen}
              toshiAlertCount={toshiAlertInfo?.count}
              isNotificationsOpen={isNotificationsOpen}
              onNotificationsOpenChange={handleNotificationsOpenChange}
              onUnreadCountChange={setNotificationUnreadCount}
              onRefresh={handleRefresh}
              onToggleToshi={handleToggleToshi}
            />
          ) : null}

          {children}
        </div>
      </main>

      {isMobile ? (
        <nav
          aria-label="Alt gezinme"
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[58] overflow-visible border-t border-[rgba(231,234,240,0.92)] bg-[linear-gradient(180deg,rgba(249,249,249,0.74)_0%,rgba(255,255,255,0.94)_24%,rgba(255,255,255,0.985)_100%)] px-3 pb-[var(--admin-mobile-dock-floor)] pt-2.5 shadow-[0_-16px_34px_rgba(17,24,39,0.08)] backdrop-blur-[24px] min-[1025px]:hidden"
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.94)_50%,rgba(255,255,255,0)_100%)]" />
          <span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-[linear-gradient(180deg,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0)_100%)]" />
          <div className="relative mx-auto w-full max-w-[30rem]">
            <span className="pointer-events-none absolute inset-x-0 bottom-0 top-[0.9rem] rounded-t-[1.4rem] border border-b-0 border-[rgba(231,234,240,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(249,249,249,0.84)_100%)] shadow-[0_-12px_24px_rgba(17,24,39,0.04)]" />
            <span className="pointer-events-none absolute inset-x-8 top-[1rem] h-px bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.88)_50%,rgba(255,255,255,0)_100%)]" />
            <div
              className={cn(
                "relative grid w-full items-end gap-x-0.5 px-1.5 pb-0.5 pt-0.5",
                rootAdmin ? "grid-cols-4" : "grid-cols-5",
              )}
            >
              <MobileDockButton icon={Home} label="Ana" active={activeDockItem === "home"} onClick={handleHome} />
              <MobileDockButton icon={Package} label="Sipariş" active={activeDockItem === "orders"} onClick={handleOrders} />
              {!rootAdmin ? (
                <MobileDockButton
                  icon={Sparkles}
                  label={toshiAlertInfo?.count ? `Toshi ${toshiAlertInfo.count > 9 ? "9+" : toshiAlertInfo.count}` : "Toshi"}
                  active={activeDockItem === "toshi"}
                  onClick={handleToggleToshi}
                  ariaControls="toshi-assistant-panel"
                  ariaExpanded={isToshiOpen}
                  ariaHaspopup="dialog"
                />
              ) : null}
              <MobileDockButton icon={Tag} label="Ürün" active={activeDockItem === "products"} onClick={handleProducts} />
              <MobileDockButton
                icon={Menu}
                label="Menü"
                active={activeDockItem === "menu"}
                onClick={handleToggleMenu}
                ariaControls="admin-mobile-drawer"
                ariaExpanded={isSidebarOpen}
                ariaHaspopup="dialog"
              />
            </div>
          </div>
        </nav>
      ) : null}

      {!rootAdmin ? (
        <AdminClientBoundary name="ToshiAssistant">
          <ToshiAssistant
            isMobile={isMobile}
            isOpen={isToshiOpen}
            onOpenChange={(next) => {
              if (isMobile) {
                setActiveMobileSurface(next ? "toshi" : null);
                return;
              }

              setDesktopToshiOpen(next);
            }}
            onAlertInfoChange={setToshiAlertInfo}
          />
        </AdminClientBoundary>
      ) : null}
    </div>
  );
}
