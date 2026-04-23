"use client";

import { useState } from "react";
import Link from "next/link";
import { Grid2X2, Heart, Home, Search, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { useWishlist } from "@/lib/wishlist-context";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { HeaderSearchOverlay } from "@/components/layout/HeaderSearchOverlay";

function isActivePath(currentPath: string, targetPath: string) {
  if (targetPath === "/") return currentPath === "/";
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function MobileBottomNav() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { getTotalItems: getCartTotal, setIsOpen: setCartOpen } = useCart();
  const { getTotalItems: getWishlistTotal } = useWishlist();
  const { buildPath, internalPathname } = useStorefrontRoute();
  const cartCount = getCartTotal();
  const wishlistCount = getWishlistTotal();

  const linkItems = [
    { label: "Ana Sayfa", href: "/", icon: Home },
    { label: "Kategoriler", href: "/urunler", icon: Grid2X2 },
    { label: "Favoriler", href: "/favoriler", icon: Heart, count: wishlistCount },
  ];

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-[70] border-t border-[#E5E7EB] bg-white/95 px-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center gap-1">
          {linkItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            const active = isActivePath(internalPathname, item.href);

            return (
              <Link
                key={item.href}
                href={buildPath(item.href)}
                className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition-colors ${
                  active ? "text-[#FF6A00]" : "text-[#6B7280] hover:text-[#111827]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="relative mx-auto flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-[#FF6A00] text-white shadow-[0_12px_28px_rgba(255,106,0,0.34)] transition active:scale-95"
            aria-label="Arama"
          >
            <Search className="h-6 w-6" />
          </button>

          {linkItems.slice(2).map((item) => {
            const Icon = item.icon;
            const active = isActivePath(internalPathname, item.href);

            return (
              <Link
                key={item.href}
                href={buildPath(item.href)}
                className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition-colors ${
                  active ? "text-[#FF6A00]" : "text-[#6B7280] hover:text-[#111827]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
                {item.count ? (
                  <span className="absolute right-4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6A00] px-1 text-[9px] text-white">
                    {item.count}
                  </span>
                ) : null}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold text-[#6B7280] transition-colors hover:text-[#111827]"
            aria-label="Sepet"
          >
            <ShoppingBag className="h-5 w-5" />
            <span>Sepet</span>
            {cartCount > 0 ? (
              <span className="absolute right-4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6A00] px-1 text-[9px] text-white">
                {cartCount}
              </span>
            ) : null}
          </button>
        </div>
      </nav>

      <HeaderSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        resolveImageSrc={resolveStorefrontAssetUrl}
      />
    </>
  );
}
