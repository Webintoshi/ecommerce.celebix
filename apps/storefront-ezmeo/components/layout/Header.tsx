"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { ROUTES, SITE_NAME, SITE_LOGO_PATH } from "@/lib/constants";
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
  const shouldUsePlaceholderLogo =
    !storeInfo?.logoUrl &&
    typeof SITE_LOGO_PATH === "string" &&
    SITE_LOGO_PATH.includes("placeholder-storefront-logo");
  const logoSrc = shouldUsePlaceholderLogo
    ? ""
    : resolveStorefrontAssetUrl(storeInfo?.logoUrl || SITE_LOGO_PATH);
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);
  const editorialLinks = [
    { label: "Urunler", href: ROUTES.products },
    { label: "Hakkimizda", href: ROUTES.about },
    { label: "Iletisim", href: ROUTES.contact },
  ];

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
          ? "border-b border-[var(--border)] bg-[rgba(243,236,226,0.82)] backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className="container-premium">
        <div className="flex h-18 items-center justify-between gap-4 py-3 lg:h-24">
          <button
            className="-ml-2 rounded-full border border-[var(--border)] bg-[rgba(255,250,244,0.75)] p-2 lg:hidden"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={copy.menuLabel}
            type="button"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link
            href={buildLocalizedPath(ROUTES.home, locale)}
            className="flex flex-shrink-0 items-center gap-3"
            aria-label={logoAlt}
          >
            {logoSrc ? (
              <div className="relative h-9 w-[126px] sm:h-10 sm:w-[140px] lg:h-10 lg:w-[146px]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  fill
                  priority
                  className="object-contain object-left"
                  sizes="(max-width: 640px) 126px, (max-width: 1024px) 140px, 146px"
                  unoptimized={usesProxiedLogo}
                />
              </div>
            ) : (
              <span className="font-serif text-xl text-[var(--foreground)] lg:text-2xl">
                {logoAlt}
              </span>
            )}
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)] xl:block">
              Premium ezmeler
            </span>
          </Link>

          <nav className="hidden items-center gap-5 lg:flex xl:gap-6">
            {headerCategories.map((category) => {
              const localizedCategoryName = getLocalizedCategoryLabel(category.slug, category.name, locale);

              if (category.children.length === 0) {
                return (
                  <Link
                    key={category.id}
                    href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                    className="store-nav-text group relative text-[var(--foreground)]/88 after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-[var(--cocoa)] after:transition-all after:duration-300 after:content-[''] hover:text-[var(--foreground)] group-hover:after:w-full"
                  >
                    {localizedCategoryName}
                  </Link>
                );
              }

              return (
                <div key={category.id} className="group relative">
                  <Link
                    href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                    className="store-nav-text relative inline-flex items-center gap-1 text-[var(--foreground)]/88 after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-[var(--cocoa)] after:transition-all after:duration-300 after:content-[''] hover:text-[var(--foreground)] group-hover:after:w-full"
                  >
                    {localizedCategoryName}
                    <ChevronDown className="h-4 w-4" />
                  </Link>

                  <div className="pointer-events-none absolute left-1/2 top-full z-30 w-72 -translate-x-1/2 pt-4 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <div className="surface-card rounded-[2rem] p-4">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                        Koleksiyon
                      </p>
                      <div className="space-y-1">
                        {category.children.map((subcategory) => (
                          <Link
                            key={subcategory.id}
                            href={buildLocalizedPath(ROUTES.category(subcategory.slug), locale)}
                            className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[rgba(255,255,255,0.72)] hover:text-[var(--foreground)]"
                          >
                            {subcategory.name}
                            <ArrowUpRight className="h-4 w-4" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="hidden items-center gap-5 xl:flex">
              {editorialLinks.map((item) => (
                <Link
                  key={item.href}
                  href={buildLocalizedPath(item.href, locale)}
                  className="store-nav-text text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="rounded-full border border-[var(--border)] bg-[rgba(255,250,244,0.75)] p-2.5"
              aria-label={copy.searchLabel}
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-5 w-5 text-[var(--foreground)]" />
            </button>

            <Link
              href={buildLocalizedPath(user ? "/hesap" : ROUTES.login, locale)}
              className="hidden rounded-full border border-[var(--border)] bg-[rgba(255,250,244,0.75)] p-2.5 sm:block"
            >
              <User className="h-5 w-5 text-[var(--foreground)]" />
            </Link>

            <button
              type="button"
              className="relative rounded-full border border-[var(--border)] bg-[rgba(255,250,244,0.75)] p-2.5"
              aria-label={copy.cartLabel}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="h-5 w-5 text-[var(--foreground)]" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] text-white">
                  {cartItemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen ? (
        <div className="border-t border-[var(--border)] bg-[rgba(246,239,229,0.96)] backdrop-blur-xl lg:hidden">
          <nav className="container-premium space-y-6 py-6">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                Ezmeo
              </p>
              <p className="max-w-xs text-sm leading-7 text-[var(--muted-foreground)]">
                Findik, fistik ve badem etrafinda kurulan editorial bir premium ezme vitrini.
              </p>
            </div>

            {headerCategories.map((category) => (
              <div key={category.id} className="space-y-2">
                <Link
                  href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                  className="store-nav-text block text-[var(--foreground)] transition-all duration-300 hover:pl-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {getLocalizedCategoryLabel(category.slug, category.name, locale)}
                </Link>

                {category.children.length > 0 ? (
                  <div className="space-y-2 border-l border-[var(--border)] pl-4">
                    {category.children.map((subcategory) => (
                      <Link
                        key={subcategory.id}
                        href={buildLocalizedPath(ROUTES.category(subcategory.slug), locale)}
                        className="store-nav-text block text-sm text-[var(--muted-foreground)] transition-all duration-300 hover:pl-2 hover:text-[var(--foreground)]"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {subcategory.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            <div className="grid gap-3 border-t border-[var(--border)] pt-4">
              {editorialLinks.map((item) => (
                <Link
                  key={item.href}
                  href={buildLocalizedPath(item.href, locale)}
                  className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[rgba(255,250,244,0.72)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
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
