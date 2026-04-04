"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartWrapper } from "@/components/cart/CartWrapper";
import { AnnouncementBar } from "@/components/sections/AnnouncementBar";
import { stripLocaleFromPathname } from "@/lib/i18n";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const internalPathname = stripLocaleFromPathname(pathname || "/");
  const isAdmin = internalPathname.startsWith("/admin");
  const isAuthPage = internalPathname === "/giris" || internalPathname === "/kayit";

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F8F8F8F8]">
        {!isAdmin && !isAuthPage && (
          <>
            <AnnouncementBar />
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
