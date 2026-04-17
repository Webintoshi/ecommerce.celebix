"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Menu, Search, ShoppingBag, User, X } from "lucide-react";
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

  const quickLinks = useMemo(
    () => [
      { label: "T\u00fcm \u00c7i\u00e7ekler", href: ROUTES.products },
      ...headerCategories.slice(0, 4).map((category) => ({
        label: getLocalizedCategoryLabel(category.slug, category.name, locale),
        href: ROUTES.category(category.slug),
      })),
      { label: "\u0130leti\u015fim", href: ROUTES.contact },
    ],
    [headerCategories, locale],
  );

  const utilityLinks = useMemo(
    () => [
      { label: "Ana Sayfa", href: ROUTES.home },
      { label: "Hakk\u0131m\u0131zda", href: ROUTES.about },
      { label: "\u0130leti\u015fim", href: ROUTES.contact },
    ],
    [],
  );

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
          ? "border-b border-[var(--store-border)] bg-[rgba(246,246,246,0.94)] shadow-[0_16px_36px_rgba(80,94,113,0.08)] backdrop-blur-xl"
          : "border-b border-transparent bg-[rgba(246,246,246,0.86)] backdrop-blur-md"
      }`}
    >
      <div className="container-premium">
        <div className="hidden items-center justify-end border-b border-[var(--store-border)] py-1.5 lg:flex">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
            {utilityLinks.map((link, index) => (
              <div key={`${link.href}-${link.label}`} className="flex items-center gap-3">
                <Link
                  href={buildLocalizedPath(link.href, locale)}
                  className="transition hover:text-[var(--store-accent)]"
                >
                  {link.label}
                </Link>
                {index < utilityLinks.length - 1 ? (
                  <span aria-hidden="true" className="text-[var(--store-border-strong)]">
                    /
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-[72px] items-center justify-between gap-3 lg:h-[86px]">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink)]"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label={copy.menuLabel}
              type="button"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink)]"
              aria-label={copy.searchLabel}
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
            </button>
          </div>

          <Link
            href={buildLocalizedPath(ROUTES.home, locale)}
            className="min-w-0 flex-shrink-0"
            aria-label={logoAlt}
          >
            {logoSrc ? (
              <div className="relative h-10 w-[148px] sm:h-11 sm:w-[172px] lg:h-[52px] lg:w-[220px]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  fill
                  priority
                  className="object-contain object-left"
                  sizes="(max-width: 640px) 148px, (max-width: 1024px) 172px, 220px"
                  unoptimized={usesProxiedLogo}
                />
              </div>
            ) : (
              <div>
                <p className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.04em] text-[var(--store-ink)] lg:text-2xl">
                  {logoAlt}
                </p>
                <p className="hidden text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--store-muted)] sm:block">
                  Premium Floral Storefront
                </p>
              </div>
            )}
          </Link>

          <nav className="hidden items-center gap-6 lg:flex xl:gap-7">
            {headerCategories.slice(0, 7).map((category) => {
              const localizedCategoryName = getLocalizedCategoryLabel(category.slug, category.name, locale);

              if (category.children.length === 0) {
                return (
                  <Link
                    key={category.id}
                    href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                    className="store-nav-text group relative text-[0.92rem] text-[var(--store-ink-soft)] transition hover:text-[var(--store-accent)]"
                  >
                    <span>{localizedCategoryName}</span>
                    <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-[var(--store-accent)] transition-all duration-300 group-hover:w-full" />
                  </Link>
                );
              }

              return (
                <div key={category.id} className="group relative">
                  <Link
                    href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                    className="store-nav-text relative inline-flex items-center gap-1 text-[0.92rem] text-[var(--store-ink-soft)] transition hover:text-[var(--store-accent)]"
                  >
                    {localizedCategoryName}
                    <ChevronDown className="h-4 w-4" />
                    <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-[var(--store-accent)] transition-all duration-300 group-hover:w-full" />
                  </Link>

                  <div className="pointer-events-none absolute left-1/2 top-full z-30 w-72 -translate-x-1/2 pt-4 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <div className="soft-panel p-4">
                      <div className="space-y-1">
                        {category.children.map((subcategory) => (
                          <Link
                            key={subcategory.id}
                            href={buildLocalizedPath(ROUTES.category(subcategory.slug), locale)}
                            className="block rounded-[18px] px-4 py-3 text-sm text-[var(--store-ink-soft)] transition hover:bg-[var(--store-surface-alt)] hover:text-[var(--store-accent)]"
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
              className="hidden h-11 items-center gap-2 rounded-full border border-[var(--store-border)] bg-white px-4 text-sm font-semibold text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)] lg:inline-flex"
              aria-label={copy.searchLabel}
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              Ara
            </button>

            <Link
              href={buildLocalizedPath(user ? "/hesap" : ROUTES.login, locale)}
              className="hidden h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)] sm:flex"
              aria-label="Hesap"
            >
              <User className="h-5 w-5" />
            </Link>

            <button
              type="button"
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
              aria-label={copy.cartLabel}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="h-5 w-5" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--store-accent)] px-1 text-[10px] font-semibold text-white">
                  {cartItemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen ? (
        <div className="border-t border-[var(--store-border)] bg-[var(--store-surface)] lg:hidden">
          <nav className="container-premium py-5">
            <div className="flex flex-wrap gap-2">
              {quickLinks.slice(0, 5).map((link) => (
                <Link
                  key={`mobile-top-${link.href}-${link.label}`}
                  href={buildLocalizedPath(link.href, locale)}
                  className="rounded-full border border-[var(--store-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--store-ink-soft)]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              {headerCategories.map((category) => (
                <div key={category.id} className="rounded-[24px] border border-[var(--store-border)] bg-white/80 p-4">
                  <Link
                    href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                    className="store-nav-text block text-[15px] text-[var(--store-ink)]"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {getLocalizedCategoryLabel(category.slug, category.name, locale)}
                  </Link>

                  {category.children.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {category.children.map((subcategory) => (
                        <Link
                          key={subcategory.id}
                          href={buildLocalizedPath(ROUTES.category(subcategory.slug), locale)}
                          className="rounded-[16px] bg-[var(--store-surface-alt)] px-3 py-2 text-sm text-[var(--store-ink-soft)]"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          {subcategory.name}
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
        quickLinks={quickLinks}
      />
    </header>
  );
}
