"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  Menu,
  Search,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import { ROUTES, SITE_NAME, SITE_LOGO_PATH } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { fetchCategories } from "@/lib/categories";
import {
  isProxiedStorefrontAssetUrl,
  resolveStorefrontAssetUrl,
} from "@/lib/asset-url";
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
  const mobileTrustNotes = [
    "Katkisiz recete odagi",
    "Net kategori hiyerarsisi",
    "Mobil-first alisveris akisi",
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

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
    <>
      <header
        className={`sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(251,248,243,0.95)] transition-all duration-300 ${
          isScrolled
            ? "shadow-[0_16px_40px_-30px_rgba(36,25,21,0.22)] backdrop-blur-xl"
            : "backdrop-blur-md"
        }`}
      >
        <div className="container-premium">
          <div className="flex items-center gap-3 py-3 lg:gap-6 lg:py-4">
            <button
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)] lg:hidden"
              onClick={() => setIsMenuOpen(true)}
              aria-label={copy.menuLabel}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link
              href={buildLocalizedPath(ROUTES.home, locale)}
              className="flex min-w-0 items-center gap-3"
              aria-label={logoAlt}
            >
              {logoSrc ? (
                <div className="relative h-9 w-[126px] sm:h-10 sm:w-[140px] lg:h-11 lg:w-[150px]">
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    fill
                    priority
                    className="object-contain object-left"
                    sizes="(max-width: 640px) 126px, (max-width: 1024px) 140px, 150px"
                    unoptimized={usesProxiedLogo}
                  />
                </div>
              ) : (
                <span className="font-serif text-xl text-[var(--foreground)] lg:text-2xl">
                  {logoAlt}
                </span>
              )}

              <span className="hidden xl:block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                Premium pantry
              </span>
            </Link>

            <nav className="hidden min-w-0 flex-1 items-center justify-center gap-6 lg:flex">
              {headerCategories.slice(0, 6).map((category) => {
                const localizedCategoryName = getLocalizedCategoryLabel(
                  category.slug,
                  category.name,
                  locale,
                );

                if (category.children.length === 0) {
                  return (
                    <Link
                      key={category.id}
                      href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                      className="store-nav-text group relative text-[var(--foreground)]/90 after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-[var(--primary)] after:transition-all after:duration-300 after:content-[''] hover:text-[var(--foreground)] group-hover:after:w-full"
                    >
                      {localizedCategoryName}
                    </Link>
                  );
                }

                return (
                  <div key={category.id} className="group relative">
                    <Link
                      href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                      className="store-nav-text inline-flex items-center gap-1 text-[var(--foreground)]/90"
                    >
                      {localizedCategoryName}
                      <ChevronDown className="h-4 w-4" />
                    </Link>

                    <div className="pointer-events-none absolute left-1/2 top-full z-30 w-72 -translate-x-1/2 pt-4 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                      <div className="rounded-[1.5rem] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-lg)]">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                          Koleksiyon
                        </p>
                        <div className="space-y-1">
                          {category.children.map((subcategory) => (
                            <Link
                              key={subcategory.id}
                              href={buildLocalizedPath(
                                ROUTES.category(subcategory.slug),
                                locale,
                              )}
                              className="flex items-center justify-between rounded-[1rem] px-4 py-3 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
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

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
                aria-label={copy.searchLabel}
                onClick={() => setIsSearchOpen(true)}
              >
                <Search className="h-5 w-5" />
              </button>

              <Link
                href={buildLocalizedPath(user ? "/hesap" : ROUTES.login, locale)}
                className="hidden h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)] sm:inline-flex"
              >
                <User className="h-5 w-5" />
              </Link>

              <button
                type="button"
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
                aria-label={copy.cartLabel}
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingBag className="h-5 w-5" />
                {cartItemCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] text-white">
                    {cartItemCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      </header>

      {isMenuOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-[rgba(32,22,17,0.34)]"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(90vw,24rem)] flex-col border-r border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xl)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <Link
                href={buildLocalizedPath(ROUTES.home, locale)}
                className="flex items-center gap-3"
                onClick={() => setIsMenuOpen(false)}
              >
                {logoSrc ? (
                  <div className="relative h-9 w-[124px]">
                    <Image
                      src={logoSrc}
                      alt={logoAlt}
                      fill
                      className="object-contain object-left"
                      sizes="124px"
                      unoptimized={usesProxiedLogo}
                    />
                  </div>
                ) : (
                  <span className="font-serif text-xl text-[var(--foreground)]">
                    {logoAlt}
                  </span>
                )}
              </Link>

              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b border-[var(--border)] px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                Mobil-first Ezmeo
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                Findik, fistik ve badem odakli koleksiyonlari daha hizli taranan, daha net bir mobil alisveris akisi ile kesfet.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {mobileTrustNotes.map((note) => (
                  <span key={note} className="chip">
                    {note}
                  </span>
                ))}
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-6">
                {headerCategories.map((category) => (
                  <div key={category.id} className="space-y-3">
                    <Link
                      href={buildLocalizedPath(ROUTES.category(category.slug), locale)}
                      className="store-nav-text block text-[var(--foreground)]"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {getLocalizedCategoryLabel(category.slug, category.name, locale)}
                    </Link>

                    {category.children.length > 0 ? (
                      <div className="grid gap-2 pl-3">
                        {category.children.map((subcategory) => (
                          <Link
                            key={subcategory.id}
                            href={buildLocalizedPath(
                              ROUTES.category(subcategory.slug),
                              locale,
                            )}
                            className="flex items-center justify-between rounded-[1rem] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm text-[var(--foreground)]"
                            onClick={() => setIsMenuOpen(false)}
                          >
                            {subcategory.name}
                            <ArrowUpRight className="h-4 w-4 text-[var(--muted-foreground)]" />
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </nav>

            <div className="border-t border-[var(--border)] px-5 py-5">
              <div className="grid gap-3">
                {editorialLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={buildLocalizedPath(item.href, locale)}
                    className="flex items-center justify-between rounded-[1rem] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <HeaderSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        locale={locale}
        resolveImageSrc={resolveStorefrontAssetUrl}
      />
    </>
  );
}
