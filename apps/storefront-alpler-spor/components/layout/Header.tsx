"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { ROUTES, SITE_NAME, SITE_LOGO_PATH } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { HeaderSearchOverlay } from "@/components/layout/HeaderSearchOverlay";
import {
  getLocalizedCategoryLabel,
  getLocalizedCopy,
} from "@/lib/i18n";

type NavSubcategory = {
  id: string;
  name: string;
  slug: string;
};

type NavCategory = {
  id: string;
  name: string;
  slug: string;
  children: NavSubcategory[];
};

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [headerCategories, setHeaderCategories] = useState<NavCategory[]>([]);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user } = useAuth();
  const { storeInfo } = useStoreInfo();
  const { locale, buildPath, internalPathname } = useStorefrontRoute();

  const copy = useMemo(() => getLocalizedCopy(locale), [locale]);
  const cartItemCount = getTotalItems();
  const primaryNavLinks = [
    { label: "Ana Sayfa", href: ROUTES.home },
    { label: "Tüm Ürünler", href: ROUTES.products },
    { label: "Kampanyalar", href: `${ROUTES.products}?sort=discounted` },
  ];
  const shouldUsePlaceholderLogo =
    !storeInfo?.logoUrl &&
    typeof SITE_LOGO_PATH === "string" &&
    SITE_LOGO_PATH.includes("placeholder-storefront-logo");
  const logoSrc = shouldUsePlaceholderLogo
    ? ""
    : resolveStorefrontAssetUrl(storeInfo?.logoUrl || SITE_LOGO_PATH);
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
        const categories = await fetchCategories(locale);
        if (!isMounted) {
          return;
        }

        const activeCategories = categories
          .filter((category) => category.is_active !== false && category.slug)
          .sort((left, right) => {
            const sortDiff = (left.sort_order || 0) - (right.sort_order || 0);
            if (sortDiff !== 0) {
              return sortDiff;
            }

            return left.name.localeCompare(right.name, "tr");
          });

        const childrenByParent = new Map<string, NavSubcategory[]>();

        for (const category of activeCategories) {
          if (!category.parent_id) {
            continue;
          }

          const siblings = childrenByParent.get(category.parent_id) || [];
          siblings.push({
            id: category.id,
            name: category.name,
            slug: category.slug,
          });
          childrenByParent.set(category.parent_id, siblings);
        }

        const topLevelCategories = activeCategories
          .filter((category) => !category.parent_id)
          .map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            children: (childrenByParent.get(category.id) || []).sort((left, right) =>
              left.name.localeCompare(right.name, "tr"),
            ),
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
  }, [locale]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "border-b border-[#E5E7EB] bg-white/94 shadow-[0_8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl"
          : "border-b border-transparent bg-white/90 backdrop-blur-md"
      }`}
    >
      <div className="container-premium">
        <div className="flex h-16 items-center justify-between lg:h-20">
          <button
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#111827] transition hover:bg-[#F3F4F6] lg:hidden"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={copy.menuLabel}
            type="button"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link href={buildPath(ROUTES.home)} className="flex-shrink-0" aria-label={logoAlt}>
            {logoSrc ? (
              <div className="relative h-7 w-[104px] sm:h-8 sm:w-[118px] lg:h-8 lg:w-[128px]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  fill
                  priority
                  className="object-contain object-left"
                  sizes="(max-width: 640px) 104px, (max-width: 1024px) 118px, 128px"
                  unoptimized={usesProxiedLogo}
                />
              </div>
            ) : (
              <span className="font-serif text-base font-black tracking-tight text-[#0B0F14] lg:text-lg">
                {logoAlt}
              </span>
            )}
          </Link>

          <nav className="hidden items-center gap-4 lg:flex xl:gap-6">
            {primaryNavLinks.map((item) => {
              const active = item.href === "/"
                ? internalPathname === "/"
                : internalPathname === item.href.split("?")[0];

              return (
                <Link
                  key={item.href}
                  href={buildPath(item.href)}
                  className={`store-nav-text group relative text-[0.92rem] transition-all duration-300 after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:bg-[#FF6A00] after:transition-all after:duration-300 after:content-[''] ${
                    active
                      ? "text-[#FF6A00] after:w-full"
                      : "text-[#374151] hover:text-[#0B0F14] after:w-0 group-hover:after:w-full"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {headerCategories.slice(0, 4).map((category) => {
              const localizedCategoryName = getLocalizedCategoryLabel(category.slug, category.name, locale);

              if (category.children.length === 0) {
                return (
                  <Link
                    key={category.id}
                    href={buildPath(ROUTES.category(category.slug))}
                    className="store-nav-text group relative text-[0.92rem] text-[#374151] transition-all duration-300 hover:text-[#0B0F14] after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0 after:bg-[#FF6A00] after:transition-all after:duration-300 after:content-[''] group-hover:after:w-full"
                  >
                    {localizedCategoryName}
                  </Link>
                );
              }

              return (
                <div key={category.id} className="group relative">
                  <Link
                    href={buildPath(ROUTES.category(category.slug))}
                    className="store-nav-text relative inline-flex items-center gap-1 text-[0.92rem] text-[#374151] transition-all duration-300 hover:text-[#0B0F14] after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0 after:bg-[#FF6A00] after:transition-all after:duration-300 after:content-[''] group-hover:after:w-full"
                  >
                    {localizedCategoryName}
                    <ChevronDown className="h-4 w-4" />
                  </Link>

                  <div className="pointer-events-none absolute left-1/2 top-full z-30 w-72 -translate-x-1/2 pt-4 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <div className="rounded-3xl border border-[#E5E7EB] bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur-sm">
                      <div className="space-y-1">
                        {category.children.map((subcategory) => (
                          <Link
                            key={subcategory.id}
                            href={buildPath(ROUTES.category(subcategory.slug))}
                            className="block rounded-2xl px-4 py-3 text-sm text-[#374151] transition-colors hover:bg-[#FFF1E8] hover:text-[#C2410C]"
                          >
                            {subcategory.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#374151] transition hover:bg-[#F3F4F6] hover:text-[#FF6A00]"
              aria-label={copy.searchLabel}
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
            </button>

            <Link
              href={buildPath(ROUTES.wishlist)}
              className="hidden h-11 w-11 items-center justify-center rounded-full text-[#374151] transition hover:bg-[#F3F4F6] hover:text-[#FF6A00] sm:flex"
              aria-label="Favoriler"
            >
              <Heart className="h-5 w-5" />
            </Link>

            <Link
              href={buildPath(user ? "/hesap" : ROUTES.login)}
              className="hidden h-11 w-11 items-center justify-center rounded-full text-[#374151] transition hover:bg-[#F3F4F6] hover:text-[#FF6A00] sm:flex"
              aria-label="Hesap"
            >
              <User className="h-5 w-5" />
            </Link>

            <button
              type="button"
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-[#374151] transition hover:bg-[#F3F4F6] hover:text-[#FF6A00]"
              aria-label={copy.cartLabel}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="h-5 w-5" />
              {cartItemCount > 0 ? (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6A00] px-1 text-[10px] text-white">
                  {cartItemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen ? (
        <div className="border-t border-[#E5E7EB] bg-white lg:hidden">
          <nav className="container-premium space-y-2 py-4">
            {primaryNavLinks.map((item) => (
              <Link
                key={item.href}
                href={buildPath(item.href)}
                className="store-nav-text block rounded-2xl bg-[#F8FAFC] px-4 py-3 text-[#111827] transition-all duration-200 hover:bg-[#FFF1E8] hover:text-[#C2410C]"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            {headerCategories.map((category) => (
              <div key={category.id} className="space-y-2 pt-2">
                <Link
                  href={buildPath(ROUTES.category(category.slug))}
                  className="store-nav-text block rounded-2xl px-4 py-3 text-[#374151] transition-all duration-200 hover:bg-[#F3F4F6] hover:text-[#0B0F14]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {getLocalizedCategoryLabel(category.slug, category.name, locale)}
                </Link>

                {category.children.length > 0 ? (
                  <div className="space-y-1 border-l border-[#FF6A00]/25 pl-4">
                    {category.children.map((subcategory) => (
                      <Link
                        key={subcategory.id}
                        href={buildPath(ROUTES.category(subcategory.slug))}
                        className="store-nav-text block rounded-xl px-3 py-2 text-sm text-[#6B7280] transition-all duration-200 hover:bg-[#FFF1E8] hover:text-[#C2410C]"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {subcategory.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
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
