"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartWrapper } from "@/components/cart/CartWrapper";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  return (
    <>
      <div className="flex min-h-screen flex-col">
        {!isAdmin && <Header />}
        <main className={isAdmin ? "" : "flex-1"}>{children}</main>
        {!isAdmin && <Footer />}
      </div>
      {!isAdmin && <CartWrapper />}
    </>
  );
}
