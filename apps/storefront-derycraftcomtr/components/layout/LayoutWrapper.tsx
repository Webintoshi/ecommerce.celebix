"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartWrapper } from "@/components/cart/CartWrapper";
import { AnnouncementBar } from "@/components/sections/AnnouncementBar";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import type { StorefrontNavigationCategory } from "@/lib/storefront-navigation";

export function LayoutWrapper({
  children,
  navigationCategories,
}: {
  children: React.ReactNode;
  navigationCategories: StorefrontNavigationCategory[];
}) {
  const { internalPathname } = useStorefrontRoute();
  const isAdmin = internalPathname.startsWith("/admin");
  const isAuthPage = internalPathname === "/giris" || internalPathname === "/kayit";

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F8F8F8F8]">
        {!isAdmin && !isAuthPage && (
          <>
            <AnnouncementBar />
            <Header navigationCategories={navigationCategories} />
          </>
        )}
        <main className={isAdmin ? "bg-[#F8F8F8F8]" : "flex-1 bg-[#F8F8F8F8]"}>{children}</main>
        {!isAdmin && <Footer categoryLinks={navigationCategories.map(({ id, name, slug }) => ({ id, name, slug }))} />}
      </div>
      {!isAdmin && <CartWrapper />}
    </>
  );
}
