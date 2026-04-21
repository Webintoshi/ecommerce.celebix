"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home, Menu, RotateCw } from "lucide-react";
import { AdminClientBoundary } from "@/components/admin/AdminClientBoundary";
import { AdminNotificationCenter } from "@/components/admin/AdminNotificationCenter";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import ToshiAssistant from "@/components/admin/ToshiAssistant";
import type { InitialAdminProfile } from "@/lib/admin-data-types";

const ADMIN_BRAND_LOGO_SRC = "/branding/celebix-x.svg";

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
      subtitle: "Kayıtlar, segmentler ve segment akışlarını mobilde yoğun tutun.",
    };
  }

  if (pathname.startsWith("/admin/analizler")) {
    return {
      title: "Canlı analiz",
      subtitle: "KPI, trafik ve operasyon metrikleri daha kompakt yüzeyde.",
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
    router.push("/admin");
  };

  const handleRefresh = () => {
    router.refresh();
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
        <div className="px-4 py-[1.125rem] pb-28 md:px-4 md:py-4 md:pb-6 xl:px-5 xl:py-5 2xl:px-6 2xl:py-6">
          <div className="sticky top-0 z-30 mb-5 rounded-[25px] border border-[#f3d8c1] bg-[rgba(255,250,245,0.92)] px-4 py-4 shadow-[0_16px_38px_rgba(112,73,44,0.12)] backdrop-blur-xl md:mb-5 md:px-5 md:py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center rounded-full border border-[#FE6100]/12 bg-[#fff4eb] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d95a08] md:text-[11px]">
                  Celebix Admin
                </div>
                <h1 className="mt-3 truncate text-[1.82rem] font-semibold tracking-[-0.045em] text-gray-950 md:text-2xl">
                  {shellMeta.title}
                </h1>
                <p className="mt-2 max-w-2xl text-[1rem] leading-6 text-[#6f6258] md:text-sm">
                  {shellMeta.subtitle}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-[#FE6100]/10 bg-white text-gray-600 transition-all hover:border-[#FE6100]/24 hover:text-[#FE6100] md:inline-flex"
                  aria-label="Sayfayı yenile"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                <AdminNotificationCenter isMobile={isMobile} />
              </div>
            </div>
          </div>

          {children}
        </div>
      </main>

      {isMobile ? (
        <div className="safe-area-bottom fixed bottom-3 left-1/2 z-50 w-[calc(100%-1rem)] max-w-[34rem] -translate-x-1/2 rounded-[32px] border border-[#f1d8c3] bg-[rgba(255,249,243,0.97)] px-3 py-3 shadow-[0_20px_44px_rgba(92,56,30,0.18)] backdrop-blur-2xl md:hidden">
          <div className="grid grid-cols-[1fr_1fr_auto_1fr_1fr] items-center gap-2">
            <button
              onClick={handleBack}
              className="flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-[24px] px-2 py-3 text-[#6c5b52] transition-all hover:bg-white/80 active:scale-95"
            >
              <ArrowLeft className="h-[1.4rem] w-[1.4rem]" />
              <span className="text-[12px] font-semibold tracking-[0.01em]">Geri</span>
            </button>

            <button
              onClick={handleHome}
              className="flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-[24px] bg-[#fff1e7] px-2 py-3 text-[#d95a08] shadow-[inset_0_0_0_1px_rgba(254,97,0,0.1)] transition-all hover:bg-[#ffe8d8] active:scale-95"
            >
              <Home className="h-[1.4rem] w-[1.4rem]" />
              <span className="text-[12px] font-semibold tracking-[0.01em]">Ana Sayfa</span>
            </button>

            <button
              onClick={() => setIsToshiOpen((current) => !current)}
              aria-label="Toshi AI Asistanı"
              className="relative flex h-[70px] w-[70px] items-center justify-center rounded-[26px] border border-[#ffc89f] bg-gradient-to-br from-[#FE6100] via-[#ff7d2c] to-[#ff9350] text-white shadow-[0_18px_32px_rgba(254,97,0,0.34)] transition-all active:scale-95"
            >
              <span className="sr-only">Toshi</span>
              <span className="flex h-12 w-12 items-center justify-center rounded-[19px] bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.26)] backdrop-blur-sm">
                <Image
                  src={ADMIN_BRAND_LOGO_SRC}
                  alt="Celebix X"
                  width={24}
                  height={24}
                  className="h-[1.65rem] w-[1.65rem] drop-shadow-[0_2px_8px_rgba(255,255,255,0.22)]"
                />
              </span>
              {toshiAlertInfo && toshiAlertInfo.count > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#b42318] px-1 text-[10px] font-bold text-white shadow-[0_10px_18px_rgba(180,35,24,0.3)]">
                  {toshiAlertInfo.count > 9 ? "9+" : toshiAlertInfo.count}
                </span>
              ) : null}
            </button>

            <button
              onClick={handleRefresh}
              className="flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-[24px] px-2 py-3 text-[#6c5b52] transition-all hover:bg-white/80 active:scale-95"
            >
              <RotateCw className="h-[1.4rem] w-[1.4rem]" />
              <span className="text-[12px] font-semibold tracking-[0.01em]">Yenile</span>
            </button>

            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-[24px] px-2 py-3 text-[#6c5b52] transition-all hover:bg-white/80 active:scale-95"
            >
              <Menu className="h-[1.4rem] w-[1.4rem]" />
              <span className="text-[11px] font-medium tracking-[0.01em]">Menü</span>
            </button>
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
