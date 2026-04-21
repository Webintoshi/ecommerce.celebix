"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
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
          <div className="mx-auto w-full max-w-[34rem] rounded-[32px] border border-[#f0d8c4] bg-[rgba(255,250,246,0.98)] px-3 py-3 shadow-[0_18px_42px_rgba(92,56,30,0.18)] backdrop-blur-2xl">
            <div className="grid grid-cols-[1fr_1fr_auto_1fr_1fr] items-end gap-2.5">
              <button
                onClick={handleHome}
                className={`flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[24px] px-2 py-3 transition-all active:scale-[0.98] ${
                  rootAdmin
                    ? "bg-[#fff0e5] text-[#d95a08] shadow-[inset_0_0_0_1px_rgba(254,97,0,0.12)]"
                    : "text-[#6c5b52] hover:bg-white/80"
                }`}
              >
                <Home className="h-[1.4rem] w-[1.4rem]" />
                <span className="text-[12px] font-semibold tracking-[0.01em]">Ana</span>
              </button>

              <button
                onClick={handleOrders}
                className={`flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[24px] px-2 py-3 transition-all active:scale-[0.98] ${
                  isOrdersRoute
                    ? "bg-[#fff0e5] text-[#d95a08] shadow-[inset_0_0_0_1px_rgba(254,97,0,0.12)]"
                    : "text-[#6c5b52] hover:bg-white/80"
                }`}
              >
                <Package className="h-[1.4rem] w-[1.4rem]" />
                <span className="text-[12px] font-semibold tracking-[0.01em]">Sipariş</span>
              </button>

              <button
                onClick={handleToggleToshi}
                aria-label="Toshi asistanını aç"
                className="relative z-10 flex h-[90px] w-[90px] -translate-y-4 items-center justify-center rounded-[32px] bg-white shadow-[0_18px_36px_rgba(92,56,30,0.22)] transition-transform active:scale-[0.98]"
              >
                <span className="absolute inset-[7px] rounded-[26px] bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.95),rgba(255,245,238,0.4)_55%,rgba(255,240,229,0.15)_100%)]" />
                <span className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[26px] border border-[#ffd5b8] bg-gradient-to-br from-[#ff9957] via-[#FE6100] to-[#df5400] shadow-[0_18px_28px_rgba(254,97,0,0.26)] ring-8 ring-white/85">
                  <Image
                    src={ADMIN_MASCOT_SRC}
                    alt="Celebix mascot"
                    width={56}
                    height={56}
                    className="h-[3rem] w-[3rem] drop-shadow-[0_4px_10px_rgba(255,255,255,0.18)]"
                    priority
                  />
                </span>
                {toshiAlertInfo && toshiAlertInfo.count > 0 ? (
                  <span className="absolute right-1 top-1 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#b42318] px-1.5 text-[10px] font-bold text-white shadow-[0_12px_18px_rgba(180,35,24,0.3)]">
                    {toshiAlertInfo.count > 9 ? "9+" : toshiAlertInfo.count}
                  </span>
                ) : null}
              </button>

              <button
                onClick={handleProducts}
                className={`flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[24px] px-2 py-3 transition-all active:scale-[0.98] ${
                  isProductsRoute
                    ? "bg-[#fff0e5] text-[#d95a08] shadow-[inset_0_0_0_1px_rgba(254,97,0,0.12)]"
                    : "text-[#6c5b52] hover:bg-white/80"
                }`}
              >
                <Tag className="h-[1.4rem] w-[1.4rem]" />
                <span className="text-[12px] font-semibold tracking-[0.01em]">Ürün</span>
              </button>

              <button
                onClick={handleToggleMenu}
                className={`flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[24px] px-2 py-3 transition-all active:scale-[0.98] ${
                  isSidebarOpen ? "bg-[#fff0e5] text-[#d95a08]" : "text-[#6c5b52] hover:bg-white/80"
                }`}
              >
                <Menu className="h-[1.4rem] w-[1.4rem]" />
                <span className="text-[12px] font-semibold tracking-[0.01em]">Menü</span>
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
