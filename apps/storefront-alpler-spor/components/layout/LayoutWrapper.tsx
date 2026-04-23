"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartWrapper } from "@/components/cart/CartWrapper";
import { AnnouncementBar } from "@/components/sections/AnnouncementBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const { internalPathname } = useStorefrontRoute();
  const isAdmin = internalPathname.startsWith("/admin");
  const isAuthPage = internalPathname === "/giris" || internalPathname === "/kayit";

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F5F7FA]">
        {!isAdmin && !isAuthPage && (
          <>
            <AnnouncementBar />
            <Header />
          </>
        )}
        <main
          className={
            isAdmin
              ? "bg-[#F5F7FA]"
              : "flex-1 bg-[#F5F7FA] pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0"
          }
        >
          {children}
        </main>
        {!isAdmin && <Footer />}
      </div>
      {!isAdmin && <CartWrapper />}
      {!isAdmin && !isAuthPage && <MobileBottomNav />}
    </>
  );
}
