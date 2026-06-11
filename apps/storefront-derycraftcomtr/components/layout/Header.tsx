"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ROUTES, SITE_NAME, SITE_LOGO_PATH } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { CUSTOMER_AUTH_URLS } from "@/lib/customer-auth-links";
import { useCart } from "@/lib/cart-context";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { HeaderGiftFinderLink } from "@/components/layout/HeaderGiftFinderLink";
import { HeaderSearchOverlay } from "@/components/layout/HeaderSearchOverlay";
import {
  HeaderIconAccount,
  HeaderIconBag,
  HeaderIconChevron,
  HeaderIconClose,
  HeaderIconMenu,
  HeaderIconSearch,
} from "@/components/layout/HeaderIcons";
import type { StorefrontNavigationCategory } from "@/lib/storefront-navigation";
import {
  getLocalizedCategoryLabel,
  getLocalizedCopy,
} from "@/lib/i18n";
import { useAnnouncementBar } from "@/lib/announcement-bar";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

const NAV_LINK_CLASS =
  "inline-flex items-center gap-1.5 font-serif text-[13px] uppercase tracking-[0.16em] text-neutral-950 transition-opacity hover:opacity-55 sm:text-[14px] lg:tracking-[0.18em]";

function UtilityIconButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "header-utility-icon relative inline-flex min-h-11 min-w-11 items-center justify-center p-2 text-neutral-950 transition-opacity hover:opacity-55",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Header({
  navigationCategories,
}: {
  navigationCategories: StorefrontNavigationCategory[];
}) {
  const [isClient, setIsClient] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeMobileCategoryId, setActiveMobileCategoryId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [openMegaMenuId, setOpenMegaMenuId] = useState<string | null>(null);
  const megaMenuCloseTimer = useRef<number | null>(null);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user, signOut } = useAuth();
  const { storeInfo } = useStoreInfo();
  const { locale, buildPath } = useStorefrontRoute();
  const { backgroundColor, textColor, isEnabled: isAnnouncementEnabled } = useAnnouncementBar();
  const useMobileAnnouncementTheme = isAnnouncementEnabled;
  const invertLogoOnMobile = useMobileAnnouncementTheme && textColor === "#FFFFFF";

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
    setIsClient(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
        setOpenMegaMenuId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (isSearchOpen) {
      setOpenMegaMenuId(null);
    }
  }, [isSearchOpen]);

  const closeMenu = () => setIsMenuOpen(false);

  const openMegaMenu = (categoryId: string) => {
    if (megaMenuCloseTimer.current) {
      window.clearTimeout(megaMenuCloseTimer.current);
      megaMenuCloseTimer.current = null;
    }
    setOpenMegaMenuId(categoryId);
  };

  const scheduleMegaMenuClose = () => {
    if (megaMenuCloseTimer.current) {
      window.clearTimeout(megaMenuCloseTimer.current);
    }
    megaMenuCloseTimer.current = window.setTimeout(() => {
      setOpenMegaMenuId(null);
    }, 120);
  };

  const navigateToCustomerAuth = (href: string) => {
    closeMenu();
    window.location.assign(href);
  };

  const toggleMobileCategory = (categoryId: string) => {
    setActiveMobileCategoryId((current) => (current === categoryId ? null : categoryId));
  };

  const openSearch = () => {
    setIsSearchOpen(true);
    setOpenMegaMenuId(null);
    closeMenu();
  };

  const mobileMenu = isClient
    ? createPortal(
        <AnimatePresence>
          {isMenuOpen ? (
            <>
              <motion.button
                type="button"
                aria-label="Menüyü kapat"
                className="fixed inset-0 z-[130] bg-black/50 lg:hidden"
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
                className="fixed inset-y-0 right-0 z-[140] flex w-[min(100vw-28px,24rem)] flex-col overflow-hidden bg-white text-neutral-900 shadow-[0_22px_60px_rgba(0,0,0,0.2)] lg:hidden"
                aria-label="Mobil menü"
              >
                <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-5">
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
                      <span className="font-serif text-2xl text-neutral-900">{logoAlt}</span>
                    )}
                  </Link>

                  <button
                    type="button"
                    onClick={closeMenu}
                    className="p-1 text-neutral-900"
                    aria-label="Menüyü kapat"
                  >
                    <HeaderIconClose size={24} />
                  </button>
                </div>

                <div className="border-b border-neutral-200 px-6 py-4">
                  <button
                    type="button"
                    onClick={openSearch}
                    className="flex w-full items-center justify-between border border-neutral-900/15 bg-neutral-50 px-4 py-3 text-left"
                  >
                    <span className="font-sans text-sm text-neutral-500">Mağazada ara</span>
                    <HeaderIconSearch size={20} />
                  </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-6 pb-40">
                  {navigationCategories.map((category) => {
                    const localizedCategoryName = getLocalizedCategoryLabel(
                      category.slug,
                      category.name,
                      locale,
                    );
                    const drawerLabel = localizedCategoryName.toLocaleUpperCase("tr");
                    const isExpanded = activeMobileCategoryId === category.id;
                    const hasChildren = category.children.length > 0;

                    return (
                      <div key={category.id} className="border-b border-neutral-200/80">
                        <div className="flex items-center gap-3 py-5">
                          <Link
                            href={buildPath(ROUTES.category(category.slug))}
                            className="flex-1 font-serif text-[15px] uppercase tracking-[0.12em] text-neutral-900"
                            onClick={closeMenu}
                          >
                            {drawerLabel}
                          </Link>

                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={() => toggleMobileCategory(category.id)}
                              className="p-1 text-neutral-400"
                              aria-label={`${drawerLabel} alt kategorilerini ${isExpanded ? "kapat" : "aç"}`}
                              aria-expanded={isExpanded}
                            >
                              <HeaderIconChevron
                                className={cn("transition-transform", isExpanded ? "rotate-180" : "")}
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
                              <div className="space-y-1 pb-4 pl-1">
                                {category.children.map((subcategory) => (
                                  <Link
                                    key={subcategory.id}
                                    href={buildPath(ROUTES.category(subcategory.slug))}
                                    className="block px-2 py-2 font-sans text-sm text-neutral-600 transition-colors hover:text-neutral-900"
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

                <div className="mt-auto border-t border-neutral-200 bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5">
                  {isAuthenticated ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Link
                        href={buildPath("/hesap")}
                        className="inline-flex min-h-12 items-center justify-center border border-neutral-900 px-4 font-serif text-sm uppercase tracking-[0.12em] text-neutral-900"
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
                        className="inline-flex min-h-12 items-center justify-center bg-neutral-900 px-4 font-serif text-sm uppercase tracking-[0.12em] text-white"
                      >
                        Çıkış
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="inline-flex min-h-12 items-center justify-center bg-neutral-900 px-4 font-serif text-sm uppercase tracking-[0.12em] text-white"
                        onClick={() => navigateToCustomerAuth(CUSTOMER_AUTH_URLS.register)}
                      >
                        Kayıt Ol
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-12 items-center justify-center border border-neutral-900 px-4 font-serif text-sm uppercase tracking-[0.12em] text-neutral-900"
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
        </AnimatePresence>,
        document.body,
      )
    : null;

  return (
    <header
      className={cn(
        "relative sticky top-0 z-50 bg-white transition-shadow duration-300 lg:bg-white",
        useMobileAnnouncementTheme && "storefront-mobile-header-themed",
        isScrolled && "shadow-[0_1px_0_rgba(0,0,0,0.06)]",
      )}
      style={
        useMobileAnnouncementTheme
          ? ({
              "--announcement-bar-bg": backgroundColor,
              "--announcement-bar-fg": textColor,
            } as CSSProperties)
          : undefined
      }
      onMouseLeave={scheduleMegaMenuClose}
    >
      <div className="container-premium">
        <div className="relative flex h-[4.5rem] items-center lg:h-[5.5rem]">
          <Link
            href={buildPath(ROUTES.home)}
            className="relative z-20 flex-shrink-0"
            aria-label={logoAlt}
          >
            {logoSrc ? (
              <div className="relative h-8 w-[100px] sm:h-9 sm:w-[112px] lg:h-9 lg:w-[124px]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  fill
                  priority
                  className={cn(
                    "object-contain object-left",
                    invertLogoOnMobile && "header-logo-on-dark",
                  )}
                  sizes="(max-width: 640px) 100px, 124px"
                  unoptimized={usesProxiedLogo}
                />
              </div>
            ) : (
              <span
                className={cn(
                  "font-serif text-lg lg:text-xl",
                  useMobileAnnouncementTheme ? "max-lg:text-inherit" : "text-neutral-900",
                )}
              >
                {logoAlt}
              </span>
            )}
          </Link>

          <nav
            className="absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-4 lg:flex xl:gap-6"
            onMouseEnter={() => {
              if (megaMenuCloseTimer.current) {
                window.clearTimeout(megaMenuCloseTimer.current);
              }
            }}
          >
            {navigationCategories.map((category) => {
              const localizedCategoryName = getLocalizedCategoryLabel(
                category.slug,
                category.name,
                locale,
              );
              const hasChildren = category.children.length > 0;
              const isMegaOpen = openMegaMenuId === category.id;

              if (!hasChildren) {
                return (
                  <Link
                    key={category.id}
                    href={buildPath(ROUTES.category(category.slug))}
                    className={NAV_LINK_CLASS}
                  >
                    {localizedCategoryName.toLocaleUpperCase("tr")}
                  </Link>
                );
              }

              return (
                <div
                  key={category.id}
                  className="relative"
                  onMouseEnter={() => openMegaMenu(category.id)}
                  onMouseLeave={scheduleMegaMenuClose}
                >
                  <Link
                    href={buildPath(ROUTES.category(category.slug))}
                    className={cn(NAV_LINK_CLASS, isMegaOpen && "opacity-55")}
                  >
                    {localizedCategoryName.toLocaleUpperCase("tr")}
                    <HeaderIconChevron
                      size={14}
                      className={cn("transition-transform", isMegaOpen && "rotate-180")}
                    />
                  </Link>

                  <AnimatePresence>
                    {isMegaOpen && !isSearchOpen ? (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute left-1/2 top-full z-30 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 pt-3"
                      >
                        <div className="overflow-hidden border border-neutral-200/90 bg-white py-2 shadow-[0_18px_40px_rgba(15,23,42,0.1)]">
                          <div className="flex flex-col">
                            {category.children.map((subcategory) => (
                              <Link
                                key={subcategory.id}
                                href={buildPath(ROUTES.category(subcategory.slug))}
                                className="px-5 py-2.5 font-serif text-[13px] leading-snug text-neutral-800 transition-colors hover:bg-neutral-50 hover:text-neutral-950"
                              >
                                {subcategory.name}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}

          </nav>

          <div className="relative z-20 ml-auto flex items-center gap-4 sm:gap-5 lg:gap-6">
            {isAuthenticated ? (
              <Link
                href={buildPath("/hesap")}
                className="hidden p-1 text-neutral-950 transition-opacity hover:opacity-55 sm:inline-flex"
                aria-label="Hesabım"
              >
                <HeaderIconAccount size={24} />
              </Link>
            ) : (
              <a
                href={CUSTOMER_AUTH_URLS.signIn}
                aria-label="Giriş yap"
                className="hidden p-1 text-neutral-950 transition-opacity hover:opacity-55 sm:inline-flex"
              >
                <HeaderIconAccount size={24} />
              </a>
            )}

            <HeaderGiftFinderLink />

            <UtilityIconButton aria-label={copy.searchLabel} onClick={openSearch}>
              <HeaderIconSearch size={24} />
            </UtilityIconButton>

            <UtilityIconButton aria-label={copy.cartLabel} onClick={() => setIsCartOpen(true)}>
              <HeaderIconBag size={24} />
              {cartItemCount > 0 ? (
                <span className="header-cart-badge absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-900 px-1 text-[9px] font-medium leading-none text-white">
                  {cartItemCount}
                </span>
              ) : null}
            </UtilityIconButton>

            <UtilityIconButton
              className="lg:hidden"
              onClick={() => {
                setIsSearchOpen(false);
                setIsMenuOpen(true);
              }}
              aria-label={copy.menuLabel}
            >
              <HeaderIconMenu size={24} />
            </UtilityIconButton>
          </div>
        </div>
      </div>

      <HeaderSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        resolveImageSrc={resolveStorefrontAssetUrl}
      />

      {mobileMenu}
    </header>
  );
}
