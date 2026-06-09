"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartWrapper } from "@/components/cart/CartWrapper";
import { DerycraftTopBar } from "@/components/sections/derycraft/DerycraftTopBar";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const { internalPathname } = useStorefrontRoute();
  const isAdmin = internalPathname.startsWith("/admin");
  const isAuthPage = internalPathname === "/giris" || internalPathname === "/kayit";

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F8F8F8F8]">
        {!isAdmin && !isAuthPage && (
          <>
            <DerycraftTopBar />
            <Header />
          </>
        )}
        <main className={isAdmin ? "bg-[#F8F8F8F8]" : "flex-1 bg-[#F8F8F8F8]"}>{children}</main>
        {!isAdmin && <Footer />}
      </div>
      {!isAdmin && <CartWrapper />}
    </>
  );
}
