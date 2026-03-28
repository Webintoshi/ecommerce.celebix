"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home, Menu, RotateCw } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import ToshiAssistant from "@/components/admin/ToshiAssistant";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => getBrowserSupabaseClient(), []);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
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

  useEffect(() => {
    if (pathname === "/admin/login") {
      setIsAuthenticated(true);
      return;
    }

    let mounted = true;

    const resolveUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      setIsAuthenticated(Boolean(user));

      if (!user) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
      }
    };

    resolveUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }

      const authenticated = Boolean(session?.user);
      setIsAuthenticated(authenticated);

      if (!authenticated && pathname !== "/admin/login") {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router, supabase]);

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

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Yukleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[#f1f1f1] font-sans" style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}>
      <AdminSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto h-screen">
        <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8">{children}</div>
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

      <ToshiAssistant />
    </div>
  );
}
