"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartWrapper } from "@/components/cart/CartWrapper";
import { AnnouncementBar } from "@/components/sections/AnnouncementBar";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  const isAuthPage = pathname === "/giris" || pathname === "/kayit";

  return (
    <>
      <div className="flex min-h-screen flex-col">
        {!isAdmin && !isAuthPage && (
          <>
            <AnnouncementBar />
            <Header />
          </>
        )}
        <main className={isAdmin ? "" : "flex-1"}>{children}</main>
        {!isAdmin && <Footer />}
      </div>
      {!isAdmin && <CartWrapper />}
    </>
  );
}
