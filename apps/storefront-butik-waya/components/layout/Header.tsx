"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ROUTES, SITE_LOGO_PATH, SITE_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { HeaderSearchOverlay } from "@/components/layout/HeaderSearchOverlay";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { getLocalizedCategoryLabel, getLocalizedCopy } from "@/lib/i18n";

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
  const [expandedMobileCategoryId, setExpandedMobileCategoryId] = useState<string | null>(null);
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
  const mobileMenuCopy = useMemo(
    () =>
      locale === "en"
        ? {
            account: "Account",
            signIn: "Sign in",
            register: "Register",
            search: "Search",
            contact: "Contact",
            viewAll: "View all",
            close: "Close menu",
            browse: "Browse",
            products: "All products",
          }
        : {
            account: "Hesap",
            signIn: "Giriş",
            register: "Kayıt ol",
            search: "Arama",
            contact: "\u0130leti\u015Fim",
            viewAll: "T\u00FCm\u00FCn\u00FC g\u00F6r",
            close: "Men\u00FCy\u00FC kapat",
            browse: "Kategoriler",
            products: "Tüm ürünler",
          },
    [locale],
  );

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

  useEffect(() => {
    if (!isMenuOpen) {
      setExpandedMobileCategoryId(null);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  const accountHref = buildPath(user ? "/hesap" : ROUTES.login);
  const registerHref = buildPath(ROUTES.register);

  return (
    <>
      <header
        className={`sticky top-0 z-50 border-b border-white/10 bg-[#000000]/98 backdrop-blur-md transition-all duration-300 ${
          isScrolled ? "shadow-[0_20px_60px_-36px_rgba(0,0,0,0.78)]" : ""
        }`}
      >
        <div className="container-premium">
          <div className="grid h-[66px] grid-cols-[1fr_auto] items-center gap-3 lg:h-[58px] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-6">
          <Link
            href={buildPath(ROUTES.home)}
            className="flex min-w-0 flex-shrink-0 lg:hidden"
            aria-label={logoAlt}
          >
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
              href={accountHref}
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.02] text-white transition-colors hover:border-white/16 hover:bg-white/8 lg:flex"
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

            <button
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.02] text-white transition-colors hover:border-white/16 hover:bg-white/8 lg:hidden"
              onClick={() => setIsMenuOpen(true)}
              aria-label={copy.menuLabel}
              type="button"
            >
              <Menu className="h-5 w-5 text-white/82" />
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

        <HeaderSearchOverlay
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          resolveImageSrc={resolveStorefrontAssetUrl}
        />
      </header>

      <AnimatePresence>
        {isMenuOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 z-[80] bg-[#050505] text-white lg:hidden"
          >
            <div className="container-premium flex h-full flex-col">
              <div className="flex h-[66px] items-center justify-between gap-4 border-b border-white/10">
                <Link href={buildPath(ROUTES.home)} aria-label={logoAlt} onClick={() => setIsMenuOpen(false)}>
                  {logoSrc ? (
                    <div className="relative h-8 w-[112px] sm:h-9 sm:w-[126px]">
                      <Image
                        src={logoSrc}
                        alt={logoAlt}
                        fill
                        className="object-contain object-left"
                        sizes="(max-width: 640px) 112px, 126px"
                        unoptimized={usesProxiedLogo}
                      />
                    </div>
                  ) : (
                    <span className="font-serif text-lg font-semibold tracking-[-0.04em] text-[#F5F5F5]">
                      {logoAlt}
                    </span>
                  )}
                </Link>

                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  aria-label={mobileMenuCopy.close}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition-colors hover:border-white/18 hover:bg-white/[0.08]"
                >
                  <X className="h-5 w-5 text-white/82" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col pb-6 pt-4">
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <span className="text-[0.68rem] uppercase tracking-[0.28em] text-white/46">
                    {mobileMenuCopy.browse}
                  </span>
                  <div className="flex items-center gap-4 text-[0.74rem] uppercase tracking-[0.2em] text-white/56">
                    {user ? (
                      <Link
                        href={accountHref}
                        className="transition-colors duration-200 hover:text-white"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {mobileMenuCopy.account}
                      </Link>
                    ) : (
                      <>
                        <Link
                          href={accountHref}
                          className="transition-colors duration-200 hover:text-white"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          {mobileMenuCopy.signIn}
                        </Link>
                        <Link
                          href={registerHref}
                          className="transition-colors duration-200 hover:text-white"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          {mobileMenuCopy.register}
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <nav className="divide-y divide-white/10">
                    <div className="py-3">
                      <Link
                        href={buildPath(ROUTES.products)}
                        className="block py-1 font-serif text-[1.2rem] leading-[1.02] tracking-[-0.03em] text-white transition-colors duration-200 hover:text-white/78"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {mobileMenuCopy.products}
                      </Link>
                    </div>
                    {headerCategories.map((category) => {
                      const localizedCategoryName = getLocalizedCategoryLabel(
                        category.slug,
                        category.name,
                        locale,
                      );
                      const isExpanded = expandedMobileCategoryId === category.id;

                      return (
                        <div key={category.id} className="py-3">
                          <div className="flex items-center gap-3">
                            <Link
                              href={buildPath(ROUTES.category(category.slug))}
                              className="min-w-0 flex-1 py-1 font-serif text-[1.2rem] leading-[1.02] tracking-[-0.03em] text-white/94 transition-colors duration-200 hover:text-white"
                              onClick={() => setIsMenuOpen(false)}
                            >
                              {localizedCategoryName}
                            </Link>

                            {category.children.length > 0 ? (
                              <button
                                type="button"
                                aria-label={`${localizedCategoryName} alt kategorileri`}
                                aria-expanded={isExpanded}
                                onClick={() =>
                                  setExpandedMobileCategoryId((current) =>
                                    current === category.id ? null : category.id,
                                  )
                                }
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72 transition-colors duration-200 hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform duration-200 ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              </button>
                            ) : null}
                          </div>

                          <AnimatePresence initial={false}>
                            {isExpanded && category.children.length > 0 ? (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="overflow-hidden"
                              >
                                <div className="space-y-3 pb-2 pt-4">
                                  <Link
                                    href={buildPath(ROUTES.category(category.slug))}
                                    className="block text-[0.72rem] uppercase tracking-[0.22em] text-white/42 transition-colors duration-200 hover:text-white/68"
                                    onClick={() => setIsMenuOpen(false)}
                                  >
                                    {mobileMenuCopy.viewAll}
                                  </Link>
                                  {category.children.map((subcategory) => (
                                    <Link
                                      key={subcategory.id}
                                      href={buildPath(ROUTES.category(subcategory.slug))}
                                      className="block text-[0.98rem] tracking-[0.01em] text-white/64 transition-colors duration-200 hover:text-white"
                                      onClick={() => setIsMenuOpen(false)}
                                    >
                                      {subcategory.name}
                                    </Link>
                                  ))}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </nav>
                </div>

                <div className="mt-6 border-t border-white/10 pt-4">
                  <div className="grid grid-cols-2 gap-3 text-[10px] uppercase tracking-[0.22em] text-white/54">
                    <button
                      type="button"
                      className="text-left transition-colors duration-200 hover:text-white"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsSearchOpen(true);
                      }}
                    >
                      {mobileMenuCopy.search}
                    </button>
                    <Link
                      href={buildPath(ROUTES.contact)}
                      className="text-right transition-colors duration-200 hover:text-white"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {mobileMenuCopy.contact}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
