"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartWrapper } from "@/components/cart/CartWrapper";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  const isAuthPage = pathname === "/giris" || pathname === "/kayit";

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F8F8F8F8]">
        {!isAdmin && !isAuthPage && <Header />}
        <main className={isAdmin ? "bg-[#F8F8F8F8]" : "flex-1 bg-[#F8F8F8F8]"}>{children}</main>
        {!isAdmin && <Footer />}
      </div>
      {!isAdmin && <CartWrapper />}
    </>
  );
}
