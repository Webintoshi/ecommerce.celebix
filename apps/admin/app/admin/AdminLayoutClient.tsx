"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ComponentType } from "react";
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
      title: "Sipariş operasyonu",
      subtitle: "Sipariş, ödeme ve teslimat akışlarını hızlı yönetin.",
    };
  }

  if (pathname.startsWith("/admin/urunler")) {
    return {
      title: "Ürün kataloğu",
      subtitle: "Ürün, koleksiyon ve feed akışlarını tek panelden yönetin.",
    };
  }

  if (pathname.startsWith("/admin/musteriler")) {
    return {
      title: "Müşteri merkezi",
      subtitle: "Kayıtlar, segmentler ve müşteri aksiyonları burada toplanır.",
    };
  }

  if (pathname.startsWith("/admin/analizler")) {
    return {
      title: "Canlı analiz",
      subtitle: "KPI, trafik ve operasyon metriklerini mobilde rahat izleyin.",
    };
  }

  if (pathname.startsWith("/admin/cms")) {
    return {
      title: "İçerik merkezi",
      subtitle: "Blog, sayfa ve politika akışlarını tek yerden yönetin.",
    };
  }

  if (pathname.startsWith("/admin/ayarlar")) {
    return {
      title: "Ayarlar",
      subtitle: "Mağaza konfigürasyonu ve cihaz bildirimleri burada toplanır.",
    };
  }

  return {
    title: "Yönetim paneli",
    subtitle: "Mobil PWA uyumlu ortak kontrol merkezi.",
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
        "flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-[22px] px-2.5 py-3 transition-all duration-200 active:scale-[0.98]",
        active
          ? "bg-[linear-gradient(180deg,#fff4eb_0%,#ffeddc_100%)] text-[#d95a08] shadow-[inset_0_0_0_1px_rgba(254,97,0,0.16),0_10px_20px_rgba(254,97,0,0.08)]"
          : "text-[#75675c] hover:bg-white/80",
      )}
    >
      <Icon className={cn("h-[1.35rem] w-[1.35rem]", active ? "opacity-100" : "opacity-80")} />
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
  const [toshiAlertInfo, setToshiAlertInfo] = useState<{
    count: number;
    summary: string;
  } | null>(null);

  const shellMeta = useMemo(() => getShellMeta(pathname), [pathname]);
  const rootAdmin = useMemo(() => isAdminRoot(pathname), [pathname]);
  const isOrdersRoute = pathname.startsWith("/admin/siparisler");
  const isProductsRoute = pathname.startsWith("/admin/urunler");
  const hideDock = isToshiOpen;

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleBack = () => {
    router.back();
  };

  const handleHome = () => {
    setIsSidebarOpen(false);
    router.push("/admin");
  };

  const handleOrders = () => {
    setIsSidebarOpen(false);
    router.push("/admin/siparisler");
  };

  const handleProducts = () => {
    setIsSidebarOpen(false);
    router.push("/admin/urunler");
  };

  const handleRefresh = () => {
    router.refresh();
  };

  const handleToggleMenu = () => {
    setIsToshiOpen(false);
    setIsSidebarOpen((current) => !current);
  };

  const handleToggleToshi = () => {
    setIsSidebarOpen(false);
    setIsToshiOpen((current) => !current);
  };

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div
      className="flex min-h-screen bg-[linear-gradient(180deg,#f8f3ed_0%,#f2ece5_42%,#efe8e0_100%)] font-sans"
      style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}
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

      <main className="h-screen min-w-0 flex-1 overflow-y-auto">
        <div className="px-4 py-5 pb-32 md:px-4 md:py-4 md:pb-6 xl:px-5 xl:py-5 2xl:px-6 2xl:py-6">
          <div className="sticky top-0 z-30 mb-5 rounded-[30px] border border-[#f3d8c1] bg-[rgba(255,250,245,0.94)] px-4 py-4 shadow-[0_18px_40px_rgba(112,73,44,0.12)] backdrop-blur-xl md:mb-5 md:px-5 md:py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-3.5">
                {isMobile && !rootAdmin ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[#ecd7c3] bg-white/90 text-[#6f6258] shadow-[0_10px_24px_rgba(112,73,44,0.08)] transition-all hover:border-[#FE6100]/20 hover:text-[#d95a08]"
                    aria-label="Geri git"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                ) : null}

                <div className="min-w-0">
                  <div className="inline-flex items-center rounded-full border border-[#FE6100]/12 bg-[#fff4eb] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d95a08] md:text-[11px]">
                    Celebix Admin
                  </div>
                  <h1 className="mt-3 truncate text-[2rem] font-semibold tracking-[-0.05em] text-gray-950 md:text-2xl">
                    {shellMeta.title}
                  </h1>
                  <p className="mt-2 max-w-2xl text-[1.02rem] leading-7 text-[#6f6258] md:text-sm">
                    {shellMeta.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <AdminNotificationCenter isMobile={isMobile} />
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
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden transition-all duration-300",
            hideDock ? "pointer-events-none translate-y-6 opacity-0" : "translate-y-0 opacity-100",
          )}
        >
          <div className="mx-auto flex w-full max-w-[35rem] items-end justify-center gap-2.5">
            <div className="flex flex-1 items-center gap-2 rounded-[30px] border border-[#ecd7c8] bg-[linear-gradient(180deg,rgba(255,251,247,0.98)_0%,rgba(248,239,230,0.96)_100%)] p-2.5 shadow-[0_20px_38px_rgba(84,50,25,0.14)] backdrop-blur-2xl">
              <MobileDockButton icon={Home} label="Ana" active={rootAdmin} onClick={handleHome} />
              <MobileDockButton icon={Package} label="Sipariş" active={isOrdersRoute} onClick={handleOrders} />
            </div>

            <button
              type="button"
              onClick={handleToggleToshi}
              aria-label="Toshi asistanını aç"
              className="group relative z-10 flex h-[104px] w-[104px] -translate-y-5 items-center justify-center rounded-[36px] bg-white shadow-[0_26px_40px_rgba(92,56,30,0.22)] transition-transform duration-200 active:scale-[0.98]"
            >
              <span className="absolute inset-[8px] rounded-[30px] bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.98),rgba(255,245,238,0.62)_54%,rgba(255,232,215,0.18)_100%)]" />
              <span className="absolute inset-[14px] rounded-[26px] border border-white/55 bg-[linear-gradient(180deg,#fff7f1_0%,#ffe7d4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" />
              <span className="relative flex h-[82px] w-[82px] items-center justify-center rounded-[28px] bg-[radial-gradient(circle_at_30%_20%,#ffb27e_0%,#ff944e_28%,#FE6100_68%,#d75600_100%)] shadow-[0_20px_30px_rgba(254,97,0,0.28)] ring-[7px] ring-white/88">
                <span className="absolute inset-[1px] rounded-[27px] border border-white/28" />
                <Image
                  src={ADMIN_MASCOT_SRC}
                  alt="Celebix mascot"
                  width={64}
                  height={64}
                  className="h-[3.4rem] w-[3.4rem] drop-shadow-[0_8px_16px_rgba(80,38,9,0.18)] transition-transform duration-200 group-hover:scale-[1.03]"
                  priority
                />
              </span>
              {toshiAlertInfo && toshiAlertInfo.count > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#b42318] px-1.5 text-[10px] font-bold text-white shadow-[0_12px_18px_rgba(180,35,24,0.3)]">
                  {toshiAlertInfo.count > 9 ? "9+" : toshiAlertInfo.count}
                </span>
              ) : null}
            </button>

            <div className="flex flex-1 items-center gap-2 rounded-[30px] border border-[#ecd7c8] bg-[linear-gradient(180deg,rgba(255,251,247,0.98)_0%,rgba(248,239,230,0.96)_100%)] p-2.5 shadow-[0_20px_38px_rgba(84,50,25,0.14)] backdrop-blur-2xl">
              <MobileDockButton icon={Tag} label="Ürün" active={isProductsRoute} onClick={handleProducts} />
              <MobileDockButton icon={Menu} label="Menü" active={isSidebarOpen} onClick={handleToggleMenu} />
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
