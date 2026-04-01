"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, ShoppingBag, User, Menu, X } from "lucide-react";
import { ROUTES, SITE_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useStoreInfo } from "@/lib/store-info-context";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { HeaderSearchOverlay } from "@/components/layout/HeaderSearchOverlay";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user } = useAuth();
  const { storeInfo } = useStoreInfo();
  const cartItemCount = getTotalItems();
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = [
    { name: "Ürünler", href: ROUTES.products },
    { name: "Hakkımızda", href: "/hakkimizda" },
    { name: "İletişim", href: ROUTES.contact },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-[#F8F8F8F8]/95 backdrop-blur-sm border-b border-neutral-200"
          : "bg-[#F8F8F8F8]"
      }`}
    >
      <div className="container-premium">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <button
            className="lg:hidden p-2 -ml-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Menü"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link href={ROUTES.home} className="flex-shrink-0" aria-label={logoAlt}>
            {logoSrc ? (
              <div className="relative h-7 w-[92px] sm:h-8 sm:w-[104px] lg:h-8 lg:w-[112px]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  fill
                  priority
                  className="object-contain object-left"
                  sizes="(max-width: 640px) 92px, (max-width: 1024px) 104px, 112px"
                  unoptimized={usesProxiedLogo}
                />
              </div>
            ) : (
              <span className="font-serif text-base lg:text-lg font-medium text-neutral-900">
                {logoAlt}
              </span>
            )}
          </Link>

          <nav className="hidden lg:flex items-center gap-12">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[15px] font-bold uppercase tracking-[0.12em] text-neutral-800 
                           hover:text-neutral-950 transition-all duration-300 relative group
                           after:content-[''] after:absolute after:-bottom-1 after:left-0 
                           after:w-0 after:h-[2px] after:bg-neutral-900 after:transition-all 
                           after:duration-300 group-hover:after:w-full"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="p-2"
              aria-label="Ara"
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="w-5 h-5 text-neutral-600" />
            </button>

            <Link href={user ? "/hesap" : ROUTES.login} className="hidden sm:block p-2">
              <User className="w-5 h-5 text-neutral-600" />
            </Link>

            <button
              type="button"
              className="p-2 relative"
              aria-label="Sepeti aç"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="w-5 h-5 text-neutral-600" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-neutral-900 text-white text-[10px] flex items-center justify-center rounded-full">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="lg:hidden bg-[#F8F8F8F8] border-t border-neutral-200">
          <nav className="container-premium py-4 space-y-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block text-base font-semibold uppercase tracking-wider text-neutral-800 
                           hover:text-neutral-950 hover:pl-2 transition-all duration-300"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <HeaderSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        resolveImageSrc={resolveStorefrontAssetUrl}
      />
    </header>
  );
}
