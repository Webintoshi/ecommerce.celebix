"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Home, ArrowLeft, RotateCw, Menu } from "lucide-react";
import ToshiAssistant from "@/components/admin/ToshiAssistant";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isInitialized) {
      if (pathname !== "/admin/login") {
        const auth = localStorage.getItem("admin_authenticated");
        setIsAuthenticated(!!auth);
        if (!auth) {
          router.push("/admin/login");
        }
      } else {
        setIsAuthenticated(true);
      }
      setIsInitialized(true);
    }
  }, [pathname, router, isInitialized]);

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

  if (isAuthenticated === null || isAuthenticated === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[#f1f1f1] font-sans" style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}>
      <AdminSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto h-screen">
        <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
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
              <span className="text-xs font-medium text-gray-600">Menü</span>
            </button>
          </div>
        </div>
      )}

      {/* Toshi AI Asistanı */}
      <ToshiAssistant />
    </div>
  );
}
