"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home, Menu, Package, RefreshCw, Tag } from "lucide-react";
import { AdminClientBoundary } from "@/components/admin/AdminClientBoundary";
import { AdminNotificationCenter } from "@/components/admin/AdminNotificationCenter";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import ToshiAssistant from "@/components/admin/ToshiAssistant";
import { cn } from "@/lib/utils";
import type { InitialAdminProfile } from "@/lib/admin-data-types";

type MobileSurface = "sidebar" | "notifications" | "toshi" | null;
const TOSHI_MASCOT_SRC = "/branding/toshi-mascot.png";

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

function MobileToshiDockButton({
  active,
  alertCount,
  onClick,
}: {
  active?: boolean;
  alertCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={alertCount && alertCount > 0 ? `Toshi asistanı, ${alertCount} yeni uyarı` : "Toshi asistanını aç"}
      aria-haspopup="dialog"
      aria-pressed={active}
      className="group relative flex min-w-[5.1rem] flex-col items-center justify-end px-1 pb-1 pt-0.5 focus-visible:outline-none"
    >
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 top-[0.35rem] h-[4.2rem] w-[4.2rem] -translate-x-1/2 rounded-full bg-[var(--admin-bg)] blur-[18px] transition-opacity duration-200 ease-out",
          active ? "opacity-100" : "opacity-45",
        )}
      />
      <span
        className={cn(
          "relative flex h-[3.8rem] w-[3.8rem] -translate-y-[0.68rem] items-center justify-center rounded-full border p-[2px] shadow-[0_18px_30px_rgba(49,34,22,0.14),0_4px_10px_rgba(49,34,22,0.06)] transition-all duration-200 ease-out group-active:scale-[0.98]",
          active
            ? "border-[var(--admin-accent-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,241,232,0.92)_100%)]"
            : "border-[rgba(255,255,255,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,248,250,0.96)_100%)]",
        )}
      >
        <span className="pointer-events-none absolute inset-[1px] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0.08)_34%,rgba(255,255,255,0)_100%)]" />
        <span className="relative block h-full w-full overflow-hidden rounded-full bg-white">
          <Image
            src={TOSHI_MASCOT_SRC}
            alt=""
            aria-hidden="true"
            fill
            sizes="64px"
            className={cn(
              "object-cover transition-transform duration-200 ease-out",
              active ? "scale-[1.18]" : "scale-[1.14]",
            )}
            style={{ objectPosition: "50% 38%" }}
            priority
          />
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.02)_42%,rgba(17,24,39,0.06)_100%)]" />
          <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/45" />
        </span>

        {alertCount && alertCount > 0 ? (
          <span className="absolute -right-1 -top-0.5 flex h-[1.2rem] min-w-[1.2rem] items-center justify-center rounded-full border border-white/85 bg-[var(--admin-heading)] px-1 text-[9px] font-bold text-white shadow-[0_6px_12px_rgba(17,24,39,0.16)]">
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "mt-[-0.08rem] text-[10px] font-semibold tracking-[0.01em] transition-all duration-200 ease-out",
          active ? "text-[var(--admin-accent-hover)]" : "text-[var(--admin-text-secondary)]",
        )}
      >
        Toshi
      </span>
    </button>
  );
}

export default function AdminLayoutClient({
  children,
  initialProfile,
}: {
  children: React.ReactNode;
  initialProfile: InitialAdminProfile | null;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isMobile, setIsMobile] = useState(false);
  const [activeMobileSurface, setActiveMobileSurface] = useState<MobileSurface>(null);
  const [desktopToshiOpen, setDesktopToshiOpen] = useState(false);
  const [desktopNotificationsOpen, setDesktopNotificationsOpen] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
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

    const mediaQuery = window.matchMedia("(max-width: 767px)");
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
      className="flex min-h-dvh bg-[var(--admin-bg)] font-sans"
      style={shellStyle}
    >
      <AdminClientBoundary
        name="AdminSidebar"
        fallback={
          <div className="hidden h-screen w-[13.5rem] shrink-0 border-l border-[var(--admin-border)] bg-white xl:block xl:w-56 2xl:w-[14.5rem]" />
        }
      >
        <AdminSidebar
          isOpen={isSidebarOpen}
          onClose={() => setActiveMobileSurface(null)}
          initialProfile={initialProfile}
        />
      </AdminClientBoundary>

      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">
        <div className="px-3.5 pb-[var(--admin-mobile-content-bottom)] pt-3 md:px-4 md:pb-5 md:pt-3 xl:px-5 xl:pb-5 xl:pt-4 2xl:px-6">
          <div className="sticky top-[max(0.45rem,env(safe-area-inset-top))] z-30 mb-2 rounded-[1.35rem] border border-[var(--admin-border)] bg-[rgba(255,255,255,0.94)] px-3 py-2.5 shadow-[0_10px_24px_rgba(17,24,39,0.055)] backdrop-blur-xl md:mb-3 md:rounded-[1.45rem] md:px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                {isMobile && !rootAdmin ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]"
                    aria-label="Geri git"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                ) : null}

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
                  aria-label="Sayfayi yenile"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {children}
        </div>
      </main>

      {isMobile ? (
        <nav
          aria-label="Alt gezinme"
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[58] overflow-visible border-t border-[rgba(231,234,240,0.92)] bg-[linear-gradient(180deg,rgba(247,248,250,0.74)_0%,rgba(255,255,255,0.94)_24%,rgba(255,255,255,0.985)_100%)] px-3 pb-[var(--admin-mobile-dock-floor)] pt-2.5 shadow-[0_-16px_34px_rgba(17,24,39,0.08)] backdrop-blur-[24px] md:hidden"
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.94)_50%,rgba(255,255,255,0)_100%)]" />
          <span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-[linear-gradient(180deg,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0)_100%)]" />
          <div className="relative mx-auto w-full max-w-[30rem]">
            <span className="pointer-events-none absolute inset-x-0 bottom-0 top-[0.9rem] rounded-t-[1.4rem] border border-b-0 border-[rgba(231,234,240,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(247,248,250,0.84)_100%)] shadow-[0_-12px_24px_rgba(17,24,39,0.04)]" />
            <span className="pointer-events-none absolute inset-x-8 top-[1rem] h-px bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.88)_50%,rgba(255,255,255,0)_100%)]" />
            <div className="relative grid w-full grid-cols-[1fr_1fr_auto_1fr_1fr] items-end gap-x-0.5 px-1.5 pb-0.5 pt-0.5">
              <MobileDockButton icon={Home} label="Ana" active={activeDockItem === "home"} onClick={handleHome} />
              <MobileDockButton icon={Package} label="Sipariş" active={activeDockItem === "orders"} onClick={handleOrders} />
              <MobileToshiDockButton
                active={activeDockItem === "toshi"}
                alertCount={toshiAlertInfo?.count}
                onClick={handleToggleToshi}
              />
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
    </div>
  );
}
