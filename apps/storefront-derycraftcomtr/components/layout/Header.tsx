"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { ROUTES, SITE_NAME, SITE_LOGO_PATH } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { CUSTOMER_AUTH_URLS } from "@/lib/customer-auth-links";
import { useCart } from "@/lib/cart-context";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { HeaderSearchOverlay } from "@/components/layout/HeaderSearchOverlay";
import type { StorefrontNavigationCategory } from "@/lib/storefront-navigation";
import {
  getLocalizedCategoryLabel,
  getLocalizedCopy,
} from "@/lib/i18n";

export function Header({
  navigationCategories,
}: {
  navigationCategories: StorefrontNavigationCategory[];
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeMobileCategoryId, setActiveMobileCategoryId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user, signOut } = useAuth();
  const { storeInfo } = useStoreInfo();
  const { locale, buildPath } = useStorefrontRoute();

  const copy = useMemo(() => getLocalizedCopy(locale), [locale]);
  const cartItemCount = getTotalItems();
  const isAuthenticated = Boolean(user);
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
    if (!isMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) {
      setActiveMobileCategoryId(null);
    }
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);

  const navigateToCustomerAuth = (href: string) => {
    closeMenu();
    window.location.assign(href);
  };

  const toggleMobileCategory = (categoryId: string) => {
    setActiveMobileCategoryId((current) => (current === categoryId ? null : categoryId));
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "border-b border-neutral-200 bg-[#F8F8F8F8]/95 backdrop-blur-sm"
          : "bg-[#F8F8F8F8]"
      }`}
    >
      <div className="container-premium">
        <div className="flex h-16 items-center lg:h-20">
          <Link
            href={buildPath(ROUTES.home)}
            className="flex-shrink-0"
            aria-label={logoAlt}
          >
            {logoSrc ? (
              <div className="relative h-7 w-[94px] sm:h-8 sm:w-[104px] lg:h-8 lg:w-[112px]">
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

          <nav className="hidden items-center gap-4 lg:ml-10 lg:flex lg:flex-1 xl:gap-6">
            {navigationCategories.map((category) => {
              const localizedCategoryName = getLocalizedCategoryLabel(category.slug, category.name, locale);

              if (category.children.length === 0) {
                return (
                  <Link
                    key={category.id}
                    href={buildPath(ROUTES.category(category.slug))}
                    className="store-nav-text group relative text-[0.92rem] text-neutral-800 transition-all duration-300 hover:text-neutral-950 after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0 after:bg-neutral-900 after:transition-all after:duration-300 after:content-[''] group-hover:after:w-full"
                  >
                    {localizedCategoryName}
                  </Link>
                );
              }

              return (
                <div key={category.id} className="group relative">
                  <Link
                    href={buildPath(ROUTES.category(category.slug))}
                    className="store-nav-text relative inline-flex items-center gap-1 text-[0.92rem] text-neutral-800 transition-all duration-300 hover:text-neutral-950 after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0 after:bg-neutral-900 after:transition-all after:duration-300 after:content-[''] group-hover:after:w-full"
                  >
                    {localizedCategoryName}
                    <ChevronDown className="h-4 w-4" />
                  </Link>

                  <div className="pointer-events-none absolute left-1/2 top-full z-30 w-72 -translate-x-1/2 pt-4 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <div className="rounded-[2rem] border border-neutral-200 bg-[#F8F8F8F8]/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                      <div className="space-y-1">
                        {category.children.map((subcategory) => (
                          <Link
                            key={subcategory.id}
                            href={buildPath(ROUTES.category(subcategory.slug))}
                            className="block rounded-2xl px-4 py-3 text-sm text-neutral-700 transition-colors hover:bg-white/80 hover:text-neutral-950"
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

          <div className="ml-auto flex items-center gap-1 sm:gap-2 lg:gap-4">
            <button
              type="button"
              className="p-2"
              aria-label={copy.searchLabel}
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-5 w-5 text-neutral-600" />
            </button>

            {isAuthenticated ? (
              <Link href={buildPath("/hesap")} className="hidden p-2 sm:block">
                <User className="h-5 w-5 text-neutral-600" />
              </Link>
            ) : (
              <a href={CUSTOMER_AUTH_URLS.signIn} className="hidden p-2 sm:block">
                <User className="h-5 w-5 text-neutral-600" />
              </a>
            )}

            <button
              type="button"
              className="relative p-2"
              aria-label={copy.cartLabel}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="h-5 w-5 text-neutral-600" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-[10px] text-white">
                  {cartItemCount}
                </span>
              ) : null}
            </button>

            <button
              className="-mr-2 rounded-full p-2 lg:hidden"
              onClick={() => setIsMenuOpen(true)}
              aria-label={copy.menuLabel}
              type="button"
            >
              <Menu className="h-5 w-5 text-neutral-800" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="Menüyü kapat"
              className="fixed inset-0 z-[70] bg-black/55 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
            />

            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="fixed inset-y-0 right-0 z-[80] flex w-[min(100vw-28px,24rem)] flex-col overflow-hidden rounded-l-[2rem] bg-white text-[#11100E] shadow-[0_22px_60px_rgba(0,0,0,0.24)] lg:hidden"
              aria-label="Mobil menü"
            >
              <div className="flex items-center justify-between px-6 pb-5 pt-6">
                <Link href={buildPath(ROUTES.home)} aria-label={logoAlt} onClick={closeMenu}>
                  {logoSrc ? (
                    <div className="relative h-8 w-[112px]">
                      <Image
                        src={logoSrc}
                        alt={logoAlt}
                        fill
                        className="object-contain object-left"
                        sizes="112px"
                        unoptimized={usesProxiedLogo}
                      />
                    </div>
                  ) : (
                    <span className="font-serif text-3xl font-semibold text-[#11100E]">{logoAlt}</span>
                  )}
                </Link>

                <button
                  type="button"
                  onClick={closeMenu}
                  className="rounded-full p-2 text-[#11100E]"
                  aria-label="Menüyü kapat"
                >
                  <X className="h-7 w-7" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-6 pb-40">
                {navigationCategories.map((category) => {
                  const localizedCategoryName = getLocalizedCategoryLabel(category.slug, category.name, locale);
                  const drawerLabel = localizedCategoryName.toLocaleUpperCase("tr");
                  const isExpanded = activeMobileCategoryId === category.id;
                  const hasChildren = category.children.length > 0;

                  return (
                    <div key={category.id} className="border-b border-[#11100E]/12">
                      <div className="flex items-center gap-3 py-5">
                        <Link
                          href={buildPath(ROUTES.category(category.slug))}
                          className="flex-1 text-[1.05rem] font-black leading-none text-[#11100E] transition-colors hover:text-[#6E5139]"
                          onClick={closeMenu}
                        >
                          {drawerLabel}
                        </Link>

                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggleMobileCategory(category.id)}
                            className="rounded-full p-1 text-[#BDBDBD]"
                            aria-label={`${drawerLabel} alt kategorilerini ${isExpanded ? "kapat" : "aç"}`}
                            aria-expanded={isExpanded}
                          >
                            <ChevronDown
                              className={`h-6 w-6 transition-transform ${
                                isExpanded ? "rotate-0 text-[#11100E]" : "-rotate-90"
                              }`}
                            />
                          </button>
                        ) : null}
                      </div>

                      <AnimatePresence initial={false}>
                        {hasChildren && isExpanded ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-1 pb-4 pl-2">
                              {category.children.map((subcategory) => (
                                <Link
                                  key={subcategory.id}
                                  href={buildPath(ROUTES.category(subcategory.slug))}
                                  className="block rounded-2xl px-3 py-2 text-[0.95rem] font-medium text-[#5E5A55] transition-colors hover:bg-[#F7F3EE] hover:text-[#11100E]"
                                  onClick={closeMenu}
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

              <div className="mt-auto border-t border-black bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5">
                {isAuthenticated ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Link
                      href={buildPath("/hesap")}
                      className="inline-flex min-h-14 items-center justify-center rounded-full bg-black px-5 text-lg font-black text-white"
                      onClick={closeMenu}
                    >
                      Hesabım
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        void signOut();
                      }}
                      className="inline-flex min-h-14 items-center justify-center rounded-full border-2 border-black px-5 text-lg font-black text-black"
                    >
                      Çıkış Yap
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="inline-flex min-h-14 items-center justify-center rounded-full bg-black px-5 text-lg font-black text-white"
                      onClick={() => navigateToCustomerAuth(CUSTOMER_AUTH_URLS.register)}
                    >
                      Kayıt Ol
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-14 items-center justify-center rounded-full border-2 border-black px-5 text-lg font-black text-black"
                      onClick={() => navigateToCustomerAuth(CUSTOMER_AUTH_URLS.signIn)}
                    >
                      Giriş Yap
                    </button>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <HeaderSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        resolveImageSrc={resolveStorefrontAssetUrl}
      />
    </header>
  );
}
