"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bot, Home, Menu, RotateCw } from "lucide-react";
import { AdminClientBoundary } from "@/components/admin/AdminClientBoundary";
import { AdminNotificationCenter } from "@/components/admin/AdminNotificationCenter";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import ToshiAssistant from "@/components/admin/ToshiAssistant";
import type { InitialAdminProfile } from "@/lib/admin-data-types";

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
        <div className="px-3 py-3 pb-24 md:px-4 md:py-4 md:pb-6 xl:px-5 xl:py-5 2xl:px-6 2xl:py-6">
          <div className="sticky top-0 z-30 mb-4 rounded-[22px] border border-[#FE6100]/10 bg-white/88 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl md:mb-5 md:px-5 md:py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center rounded-full border border-[#FE6100]/12 bg-[#fff6f1] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FE6100] md:text-[11px]">
                  Celebix Admin
                </div>
                <h1 className="mt-2 truncate text-xl font-semibold tracking-[-0.04em] text-gray-950 md:text-2xl">
                  {shellMeta.title}
                </h1>
                <p className="mt-1 max-w-2xl text-xs text-gray-500 md:text-sm">
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
        <div className="safe-area-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-[#e8ddd1] bg-white/96 px-3 py-2 backdrop-blur-xl md:hidden">
          <div className="flex items-center justify-between gap-1">
            <button
              onClick={handleBack}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl p-2.5 transition-all hover:bg-gray-100 active:scale-95"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
              <span className="text-[11px] font-medium text-gray-600">Geri</span>
            </button>

            <button
              onClick={handleHome}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl bg-primary/10 p-2.5 transition-all hover:bg-primary/20 active:scale-95"
            >
              <Home className="h-5 w-5 text-primary" />
              <span className="text-[11px] font-medium text-primary">Ana Sayfa</span>
            </button>

            <button
              onClick={() => setIsToshiOpen((current) => !current)}
              aria-label="Toshi AI Asistanı"
              className="relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] bg-gradient-to-br from-violet-600 to-indigo-600 px-3 py-2.5 text-white shadow-[0_14px_24px_rgba(79,70,229,0.22)] transition-all active:scale-95"
            >
              <Bot className="h-5 w-5" />
              <span className="text-[11px] font-semibold">Toshi</span>
              {toshiAlertInfo && toshiAlertInfo.count > 0 ? (
                <span className="absolute right-2 top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg">
                  {toshiAlertInfo.count > 9 ? "9+" : toshiAlertInfo.count}
                </span>
              ) : null}
            </button>

            <button
              onClick={handleRefresh}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl p-2.5 transition-all hover:bg-gray-100 active:scale-95"
            >
              <RotateCw className="h-5 w-5 text-gray-700" />
              <span className="text-[11px] font-medium text-gray-600">Yenile</span>
            </button>

            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl p-2.5 transition-all hover:bg-gray-100 active:scale-95"
            >
              <Menu className="h-5 w-5 text-gray-700" />
              <span className="text-[11px] font-medium text-gray-600">Menu</span>
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
