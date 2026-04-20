"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { ROUTES, SITE_LOGO_PATH, SITE_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { HeaderSearchOverlay } from "@/components/layout/HeaderSearchOverlay";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
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
  const { locale, buildPath } = useStorefrontRoute();

  const copy = useMemo(() => getLocalizedCopy(locale), [locale]);
  const cartItemCount = getTotalItems();
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
      setIsScrolled(window.scrollY > 16);
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
      className={`sticky top-0 z-50 border-b border-white/10 bg-[#000000]/98 backdrop-blur-md transition-all duration-300 ${
        isScrolled ? "shadow-[0_20px_60px_-36px_rgba(0,0,0,0.78)]" : ""
      }`}
    >
      <div className="container-premium">
        <div className="grid h-[66px] grid-cols-[auto_1fr_auto] items-center gap-3 lg:h-[58px] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              className="-ml-2 rounded-full p-2 text-white lg:hidden"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label={copy.menuLabel}
              type="button"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link href={buildPath(ROUTES.home)} className="flex-shrink-0" aria-label={logoAlt}>
              {logoSrc ? (
                <div className="relative h-8 w-[112px] sm:h-9 sm:w-[126px] lg:h-9 lg:w-[128px]">
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    fill
                    className="object-contain object-left"
                    sizes="(max-width: 640px) 112px, (max-width: 1024px) 126px, 128px"
                    unoptimized={usesProxiedLogo}
                  />
                </div>
              ) : (
                <span className="font-serif text-lg font-semibold tracking-[-0.04em] text-[#F5F5F5] lg:text-[1.32rem]">
                  {logoAlt}
                </span>
              )}
            </Link>
          </div>

          <div className="hidden lg:block" aria-hidden="true" />

          <Link
            href={buildPath(ROUTES.home)}
            className="mx-auto hidden flex-shrink-0 lg:flex"
            aria-label={logoAlt}
          >
            {logoSrc ? (
              <div className="relative h-8 w-[124px] xl:h-9 xl:w-[132px]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  fill
                  className="object-contain object-center"
                  sizes="132px"
                  unoptimized={usesProxiedLogo}
                />
              </div>
            ) : (
              <span className="font-serif text-[1.24rem] font-semibold tracking-[-0.04em] text-[#F5F5F5] xl:text-[1.32rem]">
                {logoAlt}
              </span>
            )}
          </Link>

          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.02] text-white transition-colors hover:border-white/16 hover:bg-white/8"
              aria-label={copy.searchLabel}
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-4.5 w-4.5 text-white/82" />
            </button>

            <Link
              href={buildPath(user ? "/hesap" : ROUTES.login)}
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.02] text-white transition-colors hover:border-white/16 hover:bg-white/8 sm:flex"
            >
              <User className="h-4.5 w-4.5 text-white/82" />
            </Link>

            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.02] text-white transition-colors hover:border-white/16 hover:bg-white/8"
              aria-label={copy.cartLabel}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="h-4.5 w-4.5 text-white/82" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#F5F5F5] text-[9px] text-[#222222]">
                  {cartItemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <nav className="hidden h-[34px] items-center justify-center gap-4 border-t border-white/8 lg:flex xl:gap-6 2xl:gap-7">
          {headerCategories.map((category) => {
            const localizedCategoryName = getLocalizedCategoryLabel(category.slug, category.name, locale);

            if (category.children.length === 0) {
              return (
                <Link
                  key={category.id}
                  href={buildPath(ROUTES.category(category.slug))}
                  className="group relative inline-flex shrink-0 whitespace-nowrap py-1 font-serif text-[0.82rem] font-medium tracking-[0.02em] text-white/74 after:absolute after:-bottom-[7px] after:left-0 after:h-px after:w-0 after:bg-white/88 after:transition-all after:duration-300 after:content-[''] hover:text-white group-hover:after:w-full xl:text-[0.85rem]"
                >
                  {localizedCategoryName}
                </Link>
              );
            }

            return (
              <div key={category.id} className="group relative shrink-0">
                <Link
                  href={buildPath(ROUTES.category(category.slug))}
                  className="relative inline-flex items-center gap-1 whitespace-nowrap py-1 font-serif text-[0.82rem] font-medium tracking-[0.02em] text-white/74 after:absolute after:-bottom-[7px] after:left-0 after:h-px after:w-0 after:bg-white/88 after:transition-all after:duration-300 after:content-[''] hover:text-white group-hover:after:w-full xl:text-[0.85rem]"
                >
                  {localizedCategoryName}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Link>

                <div className="pointer-events-none absolute left-1/2 top-full z-30 w-64 -translate-x-1/2 pt-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                  <div className="rounded-[1.65rem] border border-[rgba(26,26,26,0.08)] bg-[#F5F5F5] p-3 shadow-[0_24px_70px_-40px_rgba(0,0,0,0.4)]">
                    <div className="space-y-1">
                      {category.children.map((subcategory) => (
                        <Link
                          key={subcategory.id}
                          href={buildPath(ROUTES.category(subcategory.slug))}
                          className="block rounded-[1rem] px-4 py-3 text-[11.5px] font-medium tracking-[0.02em] text-[#222222] transition-colors hover:bg-white hover:text-[#222222]"
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
      </div>

      {isMenuOpen ? (
        <div className="border-t border-white/8 bg-[#000000] lg:hidden">
          <div className="container-premium px-0">
          <div className="px-1 py-5">
            <nav className="space-y-5">
              {headerCategories.map((category) => (
                <div key={category.id} className="space-y-2">
                  <Link
                    href={buildPath(ROUTES.category(category.slug))}
                    className="store-nav-text block text-white/82 transition-all duration-300 hover:pl-2 hover:text-white"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {getLocalizedCategoryLabel(category.slug, category.name, locale)}
                  </Link>

                  {category.children.length > 0 ? (
                    <div className="space-y-2 border-l border-white/12 pl-4">
                      {category.children.map((subcategory) => (
                        <Link
                          key={subcategory.id}
                          href={buildPath(ROUTES.category(subcategory.slug))}
                          className="block text-[12px] uppercase tracking-[0.18em] text-white/58 transition-all duration-300 hover:pl-2 hover:text-white"
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
          </div>
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
