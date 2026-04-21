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

const ADMIN_MASCOT_SRC = "/branding/celebix-mascot.svg";

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
        "flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[1.4rem] px-2 py-2.5 transition-all duration-200 active:scale-[0.98]",
        active
          ? "bg-[linear-gradient(180deg,#fff5ec_0%,#ffecd8_100%)] text-[#d95a08] shadow-[inset_0_0_0_1px_rgba(254,97,0,0.14),0_10px_20px_rgba(254,97,0,0.08)]"
          : "text-[#75675c]",
      )}
    >
      <Icon className={cn("h-[1.38rem] w-[1.38rem]", active ? "opacity-100" : "opacity-78")} />
      <span className="text-[12px] font-semibold tracking-[0.01em]">{label}</span>
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isToshiOpen, setIsToshiOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [toshiAlertInfo, setToshiAlertInfo] = useState<{
    count: number;
    summary: string;
  } | null>(null);

  const shellMeta = useMemo(() => getShellMeta(pathname), [pathname]);
  const rootAdmin = useMemo(() => isAdminRoot(pathname), [pathname]);
  const isOrdersRoute = pathname.startsWith("/admin/siparisler");
  const isProductsRoute = pathname.startsWith("/admin/urunler");

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setIsSidebarOpen(false);
      setIsNotificationsOpen(false);
    }
  }, [isMobile]);

  const handleBack = () => {
    router.back();
  };

  const handleHome = () => {
    setIsSidebarOpen(false);
    setIsNotificationsOpen(false);
    setIsToshiOpen(false);
    router.push("/admin");
  };

  const handleOrders = () => {
    setIsSidebarOpen(false);
    setIsNotificationsOpen(false);
    setIsToshiOpen(false);
    router.push("/admin/siparisler");
  };

  const handleProducts = () => {
    setIsSidebarOpen(false);
    setIsNotificationsOpen(false);
    setIsToshiOpen(false);
    router.push("/admin/urunler");
  };

  const handleRefresh = () => {
    router.refresh();
  };

  const handleToggleMenu = () => {
    setIsNotificationsOpen(false);
    setIsToshiOpen(false);
    setIsSidebarOpen((current) => !current);
  };

  const handleToggleToshi = () => {
    setIsSidebarOpen(false);
    setIsNotificationsOpen(false);
    setIsToshiOpen((current) => !current);
  };

  const handleNotificationsOpenChange = (next: boolean) => {
    setIsNotificationsOpen(next);
    if (next) {
      setIsSidebarOpen(false);
      setIsToshiOpen(false);
    }
  };

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const shellStyle = {
    "--admin-mobile-panel-top": "calc(env(safe-area-inset-top, 0px) + 6.45rem)",
    "--admin-mobile-panel-bottom": "calc(env(safe-area-inset-bottom, 0px) + 6.95rem)",
    "--admin-mobile-dock-floor": "calc(env(safe-area-inset-bottom, 0px) + 0.8rem)",
    "--admin-mobile-content-bottom": "calc(env(safe-area-inset-bottom, 0px) + 8.5rem)",
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
          onClose={() => setIsSidebarOpen(false)}
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
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <AdminNotificationCenter
                  isMobile={isMobile}
                  isOpen={isNotificationsOpen}
                  onOpenChange={handleNotificationsOpenChange}
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
        <div className="fixed inset-x-0 bottom-0 z-[58] px-3 pb-[var(--admin-mobile-dock-floor)] md:hidden">
          <div className="mx-auto w-full max-w-[32rem]">
            <div className="relative rounded-[2.15rem] border border-[#ead8ca] bg-[linear-gradient(180deg,rgba(255,251,247,0.98)_0%,rgba(245,235,226,0.96)_100%)] px-3 pb-3 pt-3 shadow-[0_22px_42px_rgba(84,50,25,0.15)] backdrop-blur-2xl">
              <div className="grid grid-cols-5 items-end gap-1.5">
                <MobileDockButton icon={Home} label="Ana" active={rootAdmin} onClick={handleHome} />
                <MobileDockButton icon={Package} label="Sipariş" active={isOrdersRoute} onClick={handleOrders} />
                <div className="h-[4.8rem]" />
                <MobileDockButton icon={Tag} label="Ürün" active={isProductsRoute} onClick={handleProducts} />
                <MobileDockButton icon={Menu} label="Menu" active={isSidebarOpen} onClick={handleToggleMenu} />
              </div>

              <button
                type="button"
                onClick={handleToggleToshi}
                aria-label="Toshi asistanini ac"
                className={cn(
                  "absolute left-1/2 top-0 flex h-[5.95rem] w-[5.95rem] -translate-x-1/2 -translate-y-[32%] items-center justify-center rounded-[2rem] border border-white/70 bg-white shadow-[0_22px_34px_rgba(92,56,30,0.2)] transition-transform duration-200 active:scale-[0.98]",
                  isToshiOpen ? "ring-4 ring-[#ffd7ba]" : "",
                )}
              >
                <span className="absolute inset-[0.55rem] rounded-[1.55rem] bg-[linear-gradient(180deg,#fffaf6_0%,#fff1e6_100%)]" />
                <span className="relative flex h-[4.4rem] w-[4.4rem] items-center justify-center rounded-[1.45rem] bg-[radial-gradient(circle_at_30%_20%,#ffb27e_0%,#ff944e_28%,#FE6100_68%,#d75600_100%)] shadow-[0_18px_26px_rgba(254,97,0,0.28)] ring-[6px] ring-white/90">
                  <Image
                    src={ADMIN_MASCOT_SRC}
                    alt="Celebix mascot"
                    width={54}
                    height={54}
                    className="h-[3rem] w-[3rem] drop-shadow-[0_8px_16px_rgba(80,38,9,0.18)]"
                    priority
                  />
                </span>
                {toshiAlertInfo && toshiAlertInfo.count > 0 ? (
                  <span className="absolute right-1.5 top-1.5 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#b42318] px-1.5 text-[10px] font-bold text-white shadow-[0_12px_18px_rgba(180,35,24,0.3)]">
                    {toshiAlertInfo.count > 9 ? "9+" : toshiAlertInfo.count}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminClientBoundary name="ToshiAssistant">
        <ToshiAssistant
          isMobile={isMobile}
          isOpen={isToshiOpen}
          onOpenChange={setIsToshiOpen}
          onAlertInfoChange={setToshiAlertInfo}
        />
      </AdminClientBoundary>
    </div>
  );
}
