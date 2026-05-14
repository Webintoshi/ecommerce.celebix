"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Headphones,
  Heart,
  House,
  LayoutGrid,
  Menu,
  Search,
  ShoppingBag,
  Sparkles,
  User,
  X,
} from "lucide-react";
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
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user } = useAuth();
  const { storeInfo } = useStoreInfo();
  const { locale, buildPath, internalPathname } = useStorefrontRoute();

  const copy = useMemo(() => getLocalizedCopy(locale), [locale]);
  const cartItemCount = getTotalItems();
  const primaryNavLinks = [
    { label: "Ana Sayfa", href: ROUTES.home },
    { label: "Tüm Ürünler", href: ROUTES.products },
    { label: "Kampanyalar", href: ROUTES.products },
  ];
  const shouldUsePlaceholderLogo =
    !storeInfo?.logoUrl &&
    typeof SITE_LOGO_PATH === "string" &&
    SITE_LOGO_PATH.includes("placeholder-storefront-logo");
  const preferredLogoPath = shouldUsePlaceholderLogo ? "/logo.webp" : SITE_LOGO_PATH;
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || preferredLogoPath);
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);
  const featuredMenuLinks = [
    {
      label: "Ürünleri Keşfet",
      description: "Güncel koleksiyon ve mağaza seçkisi",
      href: ROUTES.products,
      icon: Sparkles,
    },
    {
      label: "Kategorilere Göz At",
      description: "İhtiyacına göre kategoriye hızlı geçiş",
      href: ROUTES.products,
      icon: LayoutGrid,
    },
  ];
  const primaryMenuLinks = [
    { label: "Ana Sayfa", href: ROUTES.home, icon: House },
    { label: "Tüm Ürünler", href: ROUTES.products, icon: LayoutGrid },
    { label: "Favoriler", href: ROUTES.wishlist, icon: Heart },
    { label: user ? "Hesabım" : "Giriş Yap", href: user ? "/hesap" : ROUTES.login, icon: User },
  ];
  const supportPhone = storeInfo?.phone?.trim();
  const supportEmail = storeInfo?.email?.trim();
  const topMobileCategories = headerCategories.slice(0, 6);

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

  useEffect(() => {
    if (!isMenuOpen) {
      menuButtonRef.current?.focus();
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const focusTimeout = window.setTimeout(() => {
      menuCloseButtonRef.current?.focus();
    }, 40);

    return () => window.clearTimeout(focusTimeout);
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  useEffect(() => {
    setIsMenuOpen(false);
    setExpandedCategoryId(null);
  }, [internalPathname, locale]);

  useEffect(() => {
    if (isMenuOpen) {
      setIsSearchOpen(false);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (isSearchOpen) {
      setIsMenuOpen(false);
    }
  }, [isSearchOpen]);

  const openSearchFromMenu = () => {
    setIsMenuOpen(false);
    window.setTimeout(() => setIsSearchOpen(true), 90);
  };

  const openCartFromMenu = () => {
    setIsMenuOpen(false);
    window.setTimeout(() => setIsCartOpen(true), 90);
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategoryId((current) => (current === categoryId ? null : categoryId));
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "border-b border-[#E5E7EB] bg-white/94 shadow-[0_8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl"
          : "border-b border-transparent bg-white/90 backdrop-blur-md"
      }`}
    >
      <div className="container-premium">
        <div className="flex h-[4.25rem] items-center justify-between gap-3 lg:h-20">
          <button
            ref={menuButtonRef}
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white/90 text-[#111827] shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition hover:border-[#FF6A00] hover:text-[#FF6A00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/15 lg:hidden"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="alpler-spor-mobile-menu"
            aria-label={copy.menuLabel}
            type="button"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link href={buildPath(ROUTES.home)} className="flex-shrink-0" aria-label={logoAlt}>
            {logoSrc ? (
              <div className="relative h-8 w-[118px] sm:h-9 sm:w-[138px] lg:h-10 lg:w-[156px]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  fill
                  priority
                  className="object-contain object-left"
                  sizes="(max-width: 640px) 118px, (max-width: 1024px) 138px, 156px"
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
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent text-[#374151] transition hover:border-[#E5E7EB] hover:bg-[#F3F4F6] hover:text-[#FF6A00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/15"
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

      <AnimatePresence>
        {isMenuOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[80] bg-[#0B0F14]/55 backdrop-blur-[2px] lg:hidden"
              onClick={() => setIsMenuOpen(false)}
              aria-hidden="true"
            />

            <motion.aside
              id="alpler-spor-mobile-menu"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-[90] flex w-[min(92vw,24rem)] max-w-full flex-col overflow-hidden bg-[#F8FAFC] shadow-[0_24px_80px_rgba(15,23,42,0.18)] lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Mobil menü"
            >
              <div className="border-b border-[#E5E7EB] bg-white px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#FF6A00]">
                      {logoAlt}
                    </p>
                    <p className="mt-2 max-w-[15rem] text-sm leading-6 text-[#4B5563]">
                      Spor ve sneaker ürünlerinde hızlı alışveriş için seçili koleksiyonlara tek
                      dokunuşla ulaşın.
                    </p>
                  </div>

                  <button
                    ref={menuCloseButtonRef}
                    type="button"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white text-[#6B7280] transition hover:border-[#FF6A00] hover:text-[#FF6A00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/15"
                    aria-label="Menüyü kapat"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                  <button
                    type="button"
                    onClick={openSearchFromMenu}
                    className="rounded-[1.25rem] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-left transition hover:border-[#FF6A00] hover:bg-[#FFF7F1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/15"
                  >
                    <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-[#6B7280]">
                      <Search className="h-4 w-4 text-[#FF6A00]" />
                      Ara
                    </span>
                    <span className="mt-2 block text-sm font-semibold text-[#111827]">
                      Ürün veya kategori bul
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={openCartFromMenu}
                    className="rounded-[1.25rem] border border-[#111827]/10 bg-[#111827] px-4 py-3 text-left text-white transition hover:bg-[#1F2937] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/20"
                  >
                    <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-white/70">
                      <ShoppingBag className="h-4 w-4 text-[#FF6A00]" />
                      Sepet
                    </span>
                    <span className="mt-2 block text-sm font-semibold leading-5">
                      {cartItemCount > 0 ? `${cartItemCount} ürün sepette` : "Sepeti hızlıca aç"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                <Link
                  href={buildPath(ROUTES.products)}
                  className="block rounded-[1.5rem] bg-[linear-gradient(135deg,#111827_0%,#1F2937_100%)] px-4 py-4 text-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <span className="text-[11px] font-black uppercase tracking-[0.26em] text-[#FF9A4C]">
                    Koleksiyon
                  </span>
                  <span className="mt-2 block text-base font-black">Alpler Spor ürünlerini tek ekranda incele</span>
                  <span className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-white/75">
                    Ürünleri keşfet
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>

                <div className="mt-5 space-y-2">
                  {primaryMenuLinks.map((item) => {
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={buildPath(item.href)}
                        className="flex items-center justify-between rounded-[1.25rem] border border-[#E5E7EB] bg-white px-4 py-3.5 text-[#111827] transition hover:border-[#FF6A00] hover:bg-[#FFF7F1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/15"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <span className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F3F4F6] text-[#FF6A00]">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-semibold">{item.label}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#6B7280]">
                      Koleksiyonlar
                    </p>
                    <Link
                      href={buildPath(ROUTES.products)}
                      className="text-xs font-semibold text-[#FF6A00]"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Tümünü Gör
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {featuredMenuLinks.map((item) => {
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={buildPath(item.href)}
                          className="flex items-center justify-between rounded-[1.25rem] border border-[#E5E7EB] bg-white px-4 py-3.5 transition hover:border-[#FF6A00] hover:bg-[#FFF7F1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/15"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF1E8] text-[#FF6A00]">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-[#111827]">
                                {item.label}
                              </span>
                              <span className="block truncate text-xs text-[#6B7280]">
                                {item.description}
                              </span>
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[#9CA3AF]" />
                        </Link>
                      );
                    })}

                    {topMobileCategories.map((category) => {
                      const localizedCategoryName = getLocalizedCategoryLabel(
                        category.slug,
                        category.name,
                        locale,
                      );
                      const isExpanded = expandedCategoryId === category.id;

                      return (
                        <div
                          key={category.id}
                          className="rounded-[1.25rem] border border-[#E5E7EB] bg-white"
                        >
                          <div className="flex items-center">
                            <Link
                              href={buildPath(ROUTES.category(category.slug))}
                              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-sm font-semibold text-[#111827]"
                              onClick={() => setIsMenuOpen(false)}
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F3F4F6] text-[#111827]">
                                <LayoutGrid className="h-4 w-4" />
                              </span>
                              <span className="truncate">{localizedCategoryName}</span>
                            </Link>

                            {category.children.length > 0 ? (
                              <button
                                type="button"
                                className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#6B7280] transition hover:bg-[#F3F4F6] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/15"
                                onClick={() => toggleCategory(category.id)}
                                aria-expanded={isExpanded}
                                aria-label={`${localizedCategoryName} alt kategorilerini aç`}
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                />
                              </button>
                            ) : null}
                          </div>

                          {category.children.length > 0 && isExpanded ? (
                            <div className="space-y-1 border-t border-[#E5E7EB] px-3 pb-3 pt-1">
                              {category.children.map((subcategory) => (
                                <Link
                                  key={subcategory.id}
                                  href={buildPath(ROUTES.category(subcategory.slug))}
                                  className="block rounded-xl px-3 py-2.5 text-sm text-[#4B5563] transition hover:bg-[#FFF7F1] hover:text-[#C2410C]"
                                  onClick={() => setIsMenuOpen(false)}
                                >
                                  {subcategory.name}
                                </Link>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-6 rounded-[1.5rem] border border-[#E5E7EB] bg-white px-4 py-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#111827] text-[#FF6A00]">
                      <Headphones className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#6B7280]">
                        Destek
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#4B5563]">
                        Sipariş, teslimat ve ürün sorularında destek ekibine hızlıca ulaşın.
                      </p>
                      <div className="mt-3 space-y-1 text-sm text-[#111827]">
                        {supportPhone ? <p>{supportPhone}</p> : null}
                        {supportEmail ? <p className="break-all">{supportEmail}</p> : null}
                      </div>
                      <Link
                        href={buildPath(ROUTES.contact)}
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FFF1E8] px-4 py-2 text-sm font-semibold text-[#C2410C] transition hover:bg-[#FFE4D0]"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        İletişime geç
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
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
