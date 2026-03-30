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

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "bg-white/95 backdrop-blur-sm border-b border-neutral-200" : "bg-white"
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
              <div className="relative h-8 w-[108px] sm:h-9 sm:w-[120px] lg:h-9 lg:w-[132px]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  fill
                  priority
                  className="object-contain object-left"
                  sizes="(max-width: 640px) 108px, (max-width: 1024px) 120px, 132px"
                  unoptimized={usesProxiedLogo}
                />
              </div>
            ) : (
              <span className="font-serif text-lg lg:text-xl font-medium text-neutral-900">
                {logoAlt}
              </span>
            )}
          </Link>

          <nav className="hidden lg:flex items-center gap-10">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <button className="p-2" aria-label="Ara">
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
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-neutral-900 text-white text-[10px] flex items-center justify-center">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="lg:hidden bg-white border-t border-neutral-200">
          <nav className="container-premium py-4 space-y-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block text-neutral-600 hover:text-neutral-900"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
