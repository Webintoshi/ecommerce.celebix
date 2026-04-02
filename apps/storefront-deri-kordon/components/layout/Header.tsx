"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { ROUTES, SITE_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useStoreInfo } from "@/lib/store-info-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { HeaderSearchOverlay } from "@/components/layout/HeaderSearchOverlay";

type NavCategory = {
  id: string;
  name: string;
  slug: string;
};

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [headerCategories, setHeaderCategories] = useState<NavCategory[]>([]);
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

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const categories = await fetchCategories();
        if (!isMounted) {
          return;
        }

        const topLevelCategories = categories
          .filter((category) => !category.parent_id && category.is_active !== false && category.slug)
          .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0))
          .map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
          }));

        setHeaderCategories(topLevelCategories);
      } catch (error) {
        console.error("Failed to load header categories:", error);
      }
    };

    void loadCategories();

    return () => {
      isMounted = false;
    };
  }, []);

  const navItems = [
    ...headerCategories.map((category) => ({
      key: category.id,
      name: category.name,
      href: ROUTES.category(category.slug),
    })),
    { key: "about", name: "Hakkımızda", href: "/hakkimizda" },
    { key: "contact", name: "İletişim", href: ROUTES.contact },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "border-b border-neutral-200 bg-[#F8F8F8F8]/95 backdrop-blur-sm"
          : "bg-[#F8F8F8F8]"
      }`}
    >
      <div className="container-premium">
        <div className="flex h-16 items-center justify-between lg:h-20">
          <button
            className="-ml-2 p-2 lg:hidden"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label="Menü"
            type="button"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
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
              <span className="font-serif text-base font-medium text-neutral-900 lg:text-lg">
                {logoAlt}
              </span>
            )}
          </Link>

          <nav className="hidden items-center gap-5 xl:gap-7 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="store-nav-text relative text-[0.92rem] text-neutral-800 transition-all duration-300 hover:text-neutral-950 group after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0 after:bg-neutral-900 after:transition-all after:duration-300 after:content-[''] group-hover:after:w-full"
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
              <Search className="h-5 w-5 text-neutral-600" />
            </button>

            <Link href={user ? "/hesap" : ROUTES.login} className="hidden p-2 sm:block">
              <User className="h-5 w-5 text-neutral-600" />
            </Link>

            <button
              type="button"
              className="relative p-2"
              aria-label="Sepeti aç"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="h-5 w-5 text-neutral-600" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-[10px] text-white">
                  {cartItemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen ? (
        <div className="border-t border-neutral-200 bg-[#F8F8F8F8] lg:hidden">
          <nav className="container-premium space-y-4 py-4">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="store-nav-text block text-neutral-800 transition-all duration-300 hover:pl-2 hover:text-neutral-950"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}

      <HeaderSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        resolveImageSrc={resolveStorefrontAssetUrl}
      />
    </header>
  );
}
