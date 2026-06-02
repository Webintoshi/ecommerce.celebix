"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { ROUTES, SITE_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { HeaderSearchOverlay } from "@/components/layout/HeaderSearchOverlay";
import {
  buildLocalizedPath,
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

const normalizeCategoryKey = (value: string) =>
  value
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getHeaderCategoryPriority = (category: { name: string; slug: string }) => {
  const normalized = normalizeCategoryKey(`${category.slug} ${category.name}`);

  if (normalized.includes("cuzdan") || normalized.includes("kartlik")) {
    return 0;
  }

  if (normalized.includes("apple watch")) {
    return 1;
  }

  if (normalized.includes("saat kayis") || normalized.includes("watch strap")) {
    return 2;
  }

  if (normalized.includes("canta") || normalized.includes("organizer")) {
    return 3;
  }

  if (normalized.includes("aksesuar")) {
    return 4;
  }

  return 99;
};

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [headerCategories, setHeaderCategories] = useState<NavCategory[]>([]);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user } = useAuth();
  const { storeInfo } = useStoreInfo();
  const { locale } = useStorefrontRoute();

  const copy = useMemo(() => getLocalizedCopy(locale), [locale]);
  const cartItemCount = getTotalItems();
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
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
            headerPriority: getHeaderCategoryPriority(category),
            sortOrder: category.sort_order || 0,
          }));

        const orderedCategories = topLevelCategories
          .sort((left, right) => {
            const priorityDiff = left.headerPriority - right.headerPriority;
            if (priorityDiff !== 0) {
              return priorityDiff;
            }

            const sortDiff = left.sortOrder - right.sortOrder;
            if (sortDiff !== 0) {
              return sortDiff;
            }

            return left.name.localeCompare(right.name, "tr");
          })
          .map(({ headerPriority: _headerPriority, sortOrder: _sortOrder, ...category }) => category);

        setHeaderCategories(orderedCategories);
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
          ? "border-b border-[#E8DCCD] bg-[#F8F6F2]/92 shadow-[0_18px_48px_-34px_rgba(43,28,15,0.28)] backdrop-blur-xl"
          : "bg-[#F8F8F8F8]"
      }`}
    >
      <div className="container-premium">
        <div className="flex h-[4.5rem] items-center justify-between gap-3 lg:h-[5.5rem]">
          <div className="flex items-center gap-2 lg:gap-3">
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2D5C6] bg-white/80 text-neutral-800 shadow-[0_12px_24px_-22px_rgba(34,22,12,0.6)] lg:hidden"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label={copy.menuLabel}
              type="button"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link
              href={buildLocalizedPath(ROUTES.home, locale)}
              className="flex-shrink-0"
              aria-label={logoAlt}
            >
              {logoSrc ? (
                <div className="relative h-8 w-[104px] sm:h-9 sm:w-[118px] lg:h-10 lg:w-[132px]">
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    fill
                    priority
                    className="object-contain object-left"
                    sizes="(max-width: 640px) 104px, (max-width: 1024px) 118px, 132px"
                    unoptimized={usesProxiedLogo}
                  />
                </div>
              ) : (
                <span className="font-serif text-base font-medium text-neutral-900 lg:text-lg">
                  {logoAlt}
                </span>
              )}
            </Link>
          </div>

          <nav className="hidden flex-1 items-center justify-center gap-4 lg:flex xl:gap-6">
            {headerCategories.map((category) => {
              const localizedCategoryName = getLocalizedCategoryLabel(category.slug, category.name, locale);

              if (category.children.length === 0) {
                return (
                  <Link
                    key={category.id}
                    href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                    className="store-nav-text group relative text-[0.92rem] text-neutral-800 transition-all duration-300 hover:text-neutral-950 after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0 after:bg-[#8A6847] after:transition-all after:duration-300 after:content-[''] group-hover:after:w-full"
                  >
                    {localizedCategoryName}
                  </Link>
                );
              }

              return (
                <div key={category.id} className="group relative">
                  <Link
                    href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                    className="store-nav-text relative inline-flex items-center gap-1 text-[0.92rem] text-neutral-800 transition-all duration-300 hover:text-neutral-950 after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0 after:bg-[#8A6847] after:transition-all after:duration-300 after:content-[''] group-hover:after:w-full"
                  >
                    {localizedCategoryName}
                    <ChevronDown className="h-4 w-4" />
                  </Link>

                  <div className="pointer-events-none absolute left-1/2 top-full z-30 w-80 -translate-x-1/2 pt-4 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <div className="rounded-[2rem] border border-[#E6D9CA] bg-[#FBF7F1]/96 p-4 shadow-[0_24px_60px_-36px_rgba(25,16,9,0.3)] backdrop-blur-xl">
                      <div className="space-y-2">
                        {category.children.map((subcategory) => (
                          <Link
                            key={subcategory.id}
                            href={buildLocalizedPath(ROUTES.category(subcategory.slug), locale)}
                            className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm text-neutral-700 transition-colors hover:bg-white hover:text-neutral-950"
                          >
                            <span>
                              {getLocalizedCategoryLabel(
                                subcategory.slug,
                                subcategory.name,
                                locale,
                              )}
                            </span>
                            <ArrowRight className="h-4 w-4" />
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
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2D5C6] bg-white/80 text-neutral-700 shadow-[0_12px_24px_-22px_rgba(34,22,12,0.6)] transition-colors hover:text-neutral-950"
              aria-label={copy.searchLabel}
              onClick={() => {
                setIsMenuOpen(false);
                setIsSearchOpen(true);
              }}
            >
              <Search className="h-5 w-5" />
            </button>

            <Link
              href={buildLocalizedPath(user ? "/hesap" : ROUTES.login, locale)}
              className="hidden h-11 w-11 items-center justify-center rounded-full border border-[#E2D5C6] bg-white/80 text-neutral-700 shadow-[0_12px_24px_-22px_rgba(34,22,12,0.6)] transition-colors hover:text-neutral-950 sm:flex"
            >
              <User className="h-5 w-5" />
            </Link>

            <button
              type="button"
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#E2D5C6] bg-white/80 text-neutral-700 shadow-[0_12px_24px_-22px_rgba(34,22,12,0.6)] transition-colors hover:text-neutral-950"
              aria-label={copy.cartLabel}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="h-5 w-5" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#17110B] px-1 text-[10px] text-white">
                  {cartItemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen ? (
        <div className="border-t border-[#E8DCCD] bg-[linear-gradient(180deg,rgba(251,247,241,0.98)_0%,rgba(248,244,238,0.98)_100%)] shadow-[0_24px_60px_-44px_rgba(41,24,15,0.38)] lg:hidden">
          <nav className="container-premium pb-6 pt-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[#8A6847]">
                  {copy.categoriesHeading}
                </p>
                <p className="mt-2 text-sm text-neutral-600">{logoAlt}</p>
              </div>

              <Link
                href={buildLocalizedPath(ROUTES.products, locale)}
                className="inline-flex items-center gap-2 rounded-full border border-[#D9CCBB] bg-white px-4 py-2.5 text-sm font-medium text-neutral-800"
                onClick={() => setIsMenuOpen(false)}
              >
                {copy.breadcrumbProducts}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-3">
              {headerCategories.map((category) => (
                <div
                  key={category.id}
                  className="rounded-[24px] border border-[#E7DCCF] bg-white/88 p-4 shadow-[0_18px_48px_-42px_rgba(40,25,12,0.45)]"
                >
                  <Link
                    href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                    className="flex items-center justify-between gap-3 text-base font-medium text-neutral-900"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <span>{getLocalizedCategoryLabel(category.slug, category.name, locale)}</span>
                    <ArrowRight className="h-4 w-4 text-[#8A6847]" />
                  </Link>

                  {category.children.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {category.children.map((subcategory) => (
                        <Link
                          key={subcategory.id}
                          href={buildLocalizedPath(ROUTES.category(subcategory.slug), locale)}
                          className="rounded-full border border-[#E8DCCD] bg-[#FAF7F2] px-3 py-2 text-sm text-neutral-700"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          {getLocalizedCategoryLabel(subcategory.slug, subcategory.name, locale)}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </nav>
        </div>
      ) : null}

      <HeaderSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        locale={locale}
        resolveImageSrc={resolveStorefrontAssetUrl}
      />
    </header>
  );
}
