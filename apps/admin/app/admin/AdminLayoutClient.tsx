"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home, Menu, RotateCw } from "lucide-react";
import { AdminClientBoundary } from "@/components/admin/AdminClientBoundary";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import ToshiAssistant from "@/components/admin/ToshiAssistant";
import type { InitialAdminProfile } from "@/lib/admin-data-types";

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
      className="flex min-h-screen bg-[#f1f1f1] font-sans"
      style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}
    >
      <AdminClientBoundary
        name="AdminSidebar"
        fallback={
          <div className="hidden h-screen w-56 shrink-0 border-l border-gray-200 bg-[#ebebeb] xl:block 2xl:w-64" />
        }
      >
        <AdminSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          initialProfile={initialProfile}
        />
      </AdminClientBoundary>

      <main className="min-w-0 flex-1 overflow-y-auto h-screen">
        <div className="px-4 py-4 pb-24 md:px-5 md:py-5 md:pb-8 xl:px-6 xl:py-6 2xl:px-8 2xl:py-8">
          {children}
        </div>
      </main>

      {isMobile ? (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-50 safe-area-bottom">
          <div className="flex items-center justify-around">
            <button
              onClick={handleBack}
              className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-gray-100 active:scale-95 transition-all min-w-[70px]"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
              <span className="text-xs font-medium text-gray-600">Geri</span>
            </button>

            <button
              onClick={handleHome}
              className="flex flex-col items-center gap-1 p-3 rounded-xl bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all min-w-[70px]"
            >
              <Home className="w-6 h-6 text-primary" />
              <span className="text-xs font-medium text-primary">Ana Sayfa</span>
            </button>

            <button
              onClick={handleRefresh}
              className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-gray-100 active:scale-95 transition-all min-w-[70px]"
            >
              <RotateCw className="w-6 h-6 text-gray-700" />
              <span className="text-xs font-medium text-gray-600">Yenile</span>
            </button>

            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-gray-100 active:scale-95 transition-all min-w-[70px]"
            >
              <Menu className="w-6 h-6 text-gray-700" />
              <span className="text-xs font-medium text-gray-600">Menu</span>
            </button>
          </div>
        </div>
      ) : null}

      <AdminClientBoundary name="ToshiAssistant">
        <ToshiAssistant />
      </AdminClientBoundary>
    </div>
  );
}
