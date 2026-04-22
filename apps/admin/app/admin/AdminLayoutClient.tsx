"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, BellDot, Home, Menu, Package, RefreshCw, Tag } from "lucide-react";
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

const COMPACT_SHELL_ROUTES = new Set([
  "/admin/ayarlar",
  "/admin/ayarlar/tasarim",
  "/admin/cms",
  "/admin/indirimler",
  "/admin/indirimler/yeni",
  "/admin/markets",
  "/admin/muhasebe",
  "/admin/muhasebe/fatura-entegrasyonu",
  "/admin/pazarlama",
  "/admin/seo-killer",
  "/admin/seo-killer/hizli-index",
  "/admin/seo-killer/sitemap",
  "/admin/seo-killer/sosyal-onizleme",
]);

function shouldUseCompactShell(pathname: string) {
  return COMPACT_SHELL_ROUTES.has(pathname);
}

function MobileDockButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={cn(
        "group relative flex flex-1 items-center justify-center px-[0.15rem] py-1 text-[#746a62] transition-all duration-200 ease-out active:scale-[0.985] focus-visible:outline-none",
        active ? "text-[#d95a08]" : "text-[#726861]",
      )}
    >
      <span
        className={cn(
          "absolute left-1/2 top-1 h-[3px] w-5 -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,rgba(254,97,0,0.0)_0%,rgba(254,97,0,0.92)_50%,rgba(254,97,0,0.0)_100%)] transition-all duration-200 ease-out",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        className={cn(
          "relative flex min-h-[56px] w-full max-w-[4.2rem] flex-col items-center justify-center gap-[0.28rem] rounded-[1.15rem] border border-transparent px-2 py-2.5 transition-all duration-200 ease-out",
          active
            ? "border-[rgba(254,97,0,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,243,232,0.94)_100%)] shadow-[0_10px_20px_rgba(86,57,30,0.08),inset_0_1px_0_rgba(255,255,255,0.88)]"
            : "bg-transparent group-active:bg-white/40",
        )}
      >
        <Icon
          className={cn(
            "h-[1.22rem] w-[1.22rem] transition-all duration-200 ease-out",
            active ? "opacity-100 scale-100" : "opacity-[0.8] scale-[0.94]",
          )}
        />
        <span
          className={cn(
            "text-[10px] font-semibold tracking-[0.01em] transition-all duration-200 ease-out",
            active ? "opacity-100" : "opacity-[0.78]",
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
      className="group relative flex min-w-[5.35rem] flex-col items-center justify-end px-1 pb-1 pt-0.5 focus-visible:outline-none"
    >
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 top-1 h-[4.9rem] w-[4.9rem] -translate-x-1/2 rounded-[1.8rem] bg-[radial-gradient(circle_at_top,rgba(254,97,0,0.30),rgba(254,97,0,0.0)_72%)] blur-[15px] transition-opacity duration-200 ease-out",
          active ? "opacity-100" : "opacity-70",
        )}
      />
      <span
        className={cn(
          "relative flex h-[3.95rem] w-[3.95rem] -translate-y-[0.72rem] items-center justify-center rounded-[1.45rem] border p-[0.32rem] shadow-[0_18px_32px_rgba(63,41,22,0.12),0_4px_12px_rgba(63,41,22,0.06)] backdrop-blur-[18px] transition-all duration-200 ease-out group-active:scale-[0.98]",
          active
            ? "border-[rgba(254,97,0,0.26)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,241,229,0.94)_100%)]"
            : "border-[rgba(255,255,255,0.72)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,242,236,0.92)_100%)]",
        )}
      >
        <span className="pointer-events-none absolute inset-[1px] rounded-[1.32rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.88)_0%,rgba(255,255,255,0.04)_44%,rgba(255,255,255,0)_100%)]" />
        <span
          className={cn(
            "relative flex h-full w-full items-center justify-center rounded-[1.15rem] bg-[linear-gradient(180deg,#ff9a52_0%,#fe6100_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_22px_rgba(254,97,0,0.28)] transition-transform duration-200 ease-out",
            active ? "scale-100" : "scale-[0.97]",
          )}
        >
          <Image
            src={TOSHI_MASCOT_SRC}
            alt=""
            aria-hidden="true"
            width={30}
            height={30}
            className="h-[1.9rem] w-[1.9rem] object-contain"
            priority
          />
        </span>

        {alertCount && alertCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border border-white/80 bg-[#1f1611] px-1 text-[10px] font-bold text-white shadow-[0_6px_12px_rgba(31,22,17,0.18)]">
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "mt-[-0.2rem] text-[10px] font-semibold tracking-[0.01em] transition-all duration-200 ease-out",
          active ? "text-[#d95a08]" : "text-[#7b7067]",
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
  const compactShell = useMemo(() => shouldUseCompactShell(pathname), [pathname]);
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
      "max(calc(env(safe-area-inset-bottom, 0px) + 6.2rem), calc(var(--admin-mobile-keyboard-offset) + 1rem))",
    "--admin-mobile-dock-floor": "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)",
    "--admin-mobile-content-bottom":
      "max(calc(env(safe-area-inset-bottom, 0px) + 7.5rem), calc(var(--admin-mobile-keyboard-offset) + 1.5rem))",
  } as CSSProperties;

  return (
    <div
      className="flex min-h-dvh bg-[linear-gradient(180deg,#f8f3ed_0%,#f2ece5_42%,#efe8e0_100%)] font-sans"
      style={shellStyle}
    >
      <AdminClientBoundary
        name="AdminSidebar"
        fallback={
          <div className="hidden h-screen w-[13.5rem] shrink-0 border-l border-[#e6d7c8] bg-[#eee5dc] xl:block xl:w-56 2xl:w-[14.5rem]" />
        }
      >
        <AdminSidebar
          isOpen={isSidebarOpen}
          onClose={() => setActiveMobileSurface(null)}
          initialProfile={initialProfile}
        />
      </AdminClientBoundary>

      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">
        <div className="px-3.5 pb-[var(--admin-mobile-content-bottom)] pt-4 md:px-4 md:py-4 md:pb-6 xl:px-5 xl:py-5 2xl:px-6 2xl:py-6">
          <div
            className={cn(
              "sticky top-[max(0.55rem,env(safe-area-inset-top))] z-30 border border-[#f3d8c1] bg-[rgba(255,250,245,0.94)] shadow-[0_18px_40px_rgba(112,73,44,0.12)] backdrop-blur-xl",
              compactShell
                ? "mb-3 rounded-[1.45rem] px-4 py-3 md:mb-4 md:rounded-[1.55rem] md:px-4 md:py-3"
                : "mb-4 rounded-[1.9rem] px-4 py-4 md:mb-5 md:rounded-[30px] md:px-5 md:py-4",
            )}
          >
            <div className={cn("flex justify-between gap-3", compactShell ? "items-center" : "items-start")}>
              <div className="min-w-0 flex items-start gap-3.5">
                {isMobile && !rootAdmin ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[#ecd7c3] bg-white/90 text-[#6f6258] shadow-[0_10px_24px_rgba(112,73,44,0.08)] transition-all hover:border-[#FE6100]/20 hover:text-[#d95a08]"
                    aria-label="Geri git"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                ) : null}

                <div className="min-w-0">
                  <div className="inline-flex items-center rounded-full border border-[#FE6100]/12 bg-[#fff4eb] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d95a08]">
                    Celebix Admin
                  </div>
                  {!compactShell ? (
                    <>
                      <h1 className="mt-3 truncate text-[1.85rem] font-semibold tracking-[-0.05em] text-gray-950 md:text-2xl">
                        {shellMeta.title}
                      </h1>
                      {!isMobile ? (
                        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-[#6f6258]">{shellMeta.subtitle}</p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleNotificationsOpenChange(!isNotificationsOpen)}
                            className={cn(
                              "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 py-2 text-left text-[12px] font-semibold tracking-[0.01em] transition-all active:scale-[0.99]",
                              isNotificationsOpen
                                ? "border-[#FE6100]/20 bg-[#fff2e7] text-[#d95a08]"
                                : "border-[#ecd7c3] bg-white/88 text-[#6f6258]",
                            )}
                          >
                            <BellDot className="h-4 w-4 shrink-0" />
                            <span>
                              {notificationUnreadCount > 0
                                ? `${notificationUnreadCount} yeni bildirim`
                                : "Bildirimler temiz"}
                            </span>
                          </button>
                        </div>
                      )}
                    </>
                  ) : null}
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
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[#ecd7c3] bg-white/90 text-[#6f6258] shadow-[0_10px_24px_rgba(112,73,44,0.08)] transition-all hover:border-[#FE6100]/20 hover:text-[#d95a08] md:h-10 md:w-10"
                  aria-label="Sayfayı yenile"
                >
                  <RefreshCw className="h-5 w-5 md:h-4 md:w-4" />
                </button>
              </div>
            </div>
          </div>

          {children}
        </div>
      </main>

      {isMobile ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[58] px-3 pb-[var(--admin-mobile-dock-floor)] md:hidden">
          <div className="mx-auto h-9 w-[86%] max-w-[26rem] bg-[radial-gradient(circle_at_center,rgba(121,86,56,0.18),rgba(121,86,56,0)_72%)] blur-2xl" />
          <nav
            aria-label="Alt gezinme"
            className="pointer-events-auto relative mx-auto w-full max-w-[30rem] overflow-visible rounded-[2rem] border border-[rgba(115,101,89,0.12)] bg-[linear-gradient(180deg,rgba(255,252,248,0.98)_0%,rgba(246,239,233,0.96)_100%)] shadow-[0_22px_42px_rgba(48,34,22,0.08),0_6px_14px_rgba(48,34,22,0.04)] backdrop-blur-[28px]"
          >
            <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.94)_50%,rgba(255,255,255,0)_100%)]" />
            <span className="pointer-events-none absolute left-1/2 top-0 h-16 w-40 -translate-x-1/2 bg-[radial-gradient(circle_at_top,rgba(255,255,255,1),rgba(255,255,255,0)_75%)] opacity-90" />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-[2rem] bg-[linear-gradient(180deg,rgba(229,220,211,0)_0%,rgba(229,220,211,0.16)_100%)]" />
            <div className="relative grid w-full grid-cols-[1fr_1fr_auto_1fr_1fr] items-end gap-x-0.5 px-1.5 pb-1.5 pt-1">
              <MobileDockButton icon={Home} label="Ana" active={activeDockItem === "home"} onClick={handleHome} />
              <MobileDockButton icon={Package} label="Sipariş" active={activeDockItem === "orders"} onClick={handleOrders} />
              <MobileToshiDockButton
                active={activeDockItem === "toshi"}
                alertCount={toshiAlertInfo?.count}
                onClick={handleToggleToshi}
              />
              <MobileDockButton icon={Tag} label="Ürün" active={activeDockItem === "products"} onClick={handleProducts} />
              <MobileDockButton icon={Menu} label="Menü" active={activeDockItem === "menu"} onClick={handleToggleMenu} />
            </div>
          </nav>
        </div>
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
