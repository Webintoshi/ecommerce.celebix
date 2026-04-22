"use client";

import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, BellDot, Home, Menu, Package, RefreshCw, Sparkles, Tag, Users } from "lucide-react";
import { AdminClientBoundary } from "@/components/admin/AdminClientBoundary";
import { AdminNotificationCenter } from "@/components/admin/AdminNotificationCenter";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import ToshiAssistant from "@/components/admin/ToshiAssistant";
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
      className={cn(
        "flex flex-1 items-center justify-center px-1 py-1.5 transition-all duration-200 active:scale-[0.98]",
        active ? "text-[#d95a08]" : "text-[#726861]",
      )}
    >
      <span
        className={cn(
          "flex min-h-[54px] w-full max-w-[4.7rem] flex-col items-center justify-center gap-1 rounded-[1.1rem] px-2 py-2 transition-all duration-200",
          active ? "bg-[#fff1e7]" : "bg-transparent",
        )}
      >
        <Icon className={cn("h-[1.34rem] w-[1.34rem] transition-all duration-200", active ? "opacity-100" : "opacity-80")} />
        <span className={cn("text-[11px] font-medium tracking-[0.01em] transition-all duration-200", active ? "opacity-100" : "opacity-82")}>
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
  const isCustomersRoute = pathname.startsWith("/admin/musteriler");
  const isSidebarOpen = isMobile ? activeMobileSurface === "sidebar" : false;
  const isNotificationsOpen = isMobile ? activeMobileSurface === "notifications" : desktopNotificationsOpen;
  const isToshiOpen = isMobile ? activeMobileSurface === "toshi" : desktopToshiOpen;
  const hasToshiAlert = Boolean(toshiAlertInfo?.count && toshiAlertInfo.count > 0);

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

  const handleCustomers = () => {
    setActiveMobileSurface(null);
    setDesktopNotificationsOpen(false);
    setDesktopToshiOpen(false);
    router.push("/admin/musteriler");
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
      "max(calc(env(safe-area-inset-bottom, 0px) + 5.35rem), calc(var(--admin-mobile-keyboard-offset) + 1rem))",
    "--admin-mobile-dock-floor": "calc(env(safe-area-inset-bottom, 0px) + 0.8rem)",
    "--admin-mobile-content-bottom":
      "max(calc(env(safe-area-inset-bottom, 0px) + 6.6rem), calc(var(--admin-mobile-keyboard-offset) + 1.5rem))",
  } as CSSProperties;

  return (
    <div
      className="flex min-h-dvh bg-[linear-gradient(180deg,#f8f3ed_0%,#f2ece5_42%,#efe8e0_100%)] font-sans"
      style={shellStyle}
    >
      <AdminClientBoundary
        name="AdminSidebar"
        fallback={
          <div className="hidden h-screen w-56 shrink-0 border-l border-[#e6d7c8] bg-[#eee5dc] xl:block 2xl:w-64" />
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
          <div className="sticky top-[max(0.55rem,env(safe-area-inset-top))] z-30 mb-4 rounded-[1.9rem] border border-[#f3d8c1] bg-[rgba(255,250,245,0.94)] px-4 py-4 shadow-[0_18px_40px_rgba(112,73,44,0.12)] backdrop-blur-xl md:mb-5 md:rounded-[30px] md:px-5 md:py-4">
            <div className="flex items-start justify-between gap-3">
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
                      <button
                        type="button"
                        onClick={handleToggleToshi}
                        className={cn(
                          "inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-left text-[12px] font-semibold tracking-[0.01em] transition-all active:scale-[0.99]",
                          isToshiOpen
                            ? "border-[#FE6100]/24 bg-[#fff2e7] text-[#d95a08]"
                            : "border-[#ecd7c3] bg-white/88 text-[#6f6258]",
                        )}
                      >
                        <Sparkles className="h-4 w-4 shrink-0" />
                        <span className="truncate">{hasToshiAlert ? toshiAlertInfo?.summary : "Toshi hazır"}</span>
                      </button>
                    </div>
                  )}
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
        <div className="fixed inset-x-0 bottom-0 z-[58] md:hidden">
          <div className="border-t border-[#e7ddd3] bg-[rgba(250,247,244,0.94)] shadow-[0_-8px_24px_rgba(61,43,28,0.06)] backdrop-blur-[22px]">
            <div className="mx-auto flex w-full max-w-[32rem] items-end justify-between px-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] pt-2">
              <MobileDockButton icon={Home} label="Ana" active={rootAdmin} onClick={handleHome} />
              <MobileDockButton icon={Package} label="Sipariş" active={isOrdersRoute} onClick={handleOrders} />
              <MobileDockButton icon={Tag} label="Ürün" active={isProductsRoute} onClick={handleProducts} />
              <MobileDockButton icon={Users} label="Müşteri" active={isCustomersRoute} onClick={handleCustomers} />
              <MobileDockButton icon={Menu} label="Menü" active={isSidebarOpen} onClick={handleToggleMenu} />
            </div>
          </div>
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
