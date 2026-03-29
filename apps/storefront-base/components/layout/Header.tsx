"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
  Facebook,
  Heart,
  HelpCircle,
  Home,
  Instagram,
  Menu,
  Phone,
  Search,
  ShoppingBag,
  Truck,
  User,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CONTACT_INFO,
  NAV_LINKS,
  ROUTES,
  SITE_LOGO_PATH,
  SITE_NAME,
  SOCIAL_LINKS,
  TOP_BAR_MESSAGE,
} from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { searchProducts } from "@/lib/products";
import type { Product, CategoryInfo } from "@/types/product";

const quickCategoryTones = [
  "from-amber-50 to-orange-100 text-amber-700",
  "from-slate-100 to-slate-200 text-slate-700",
  "from-emerald-50 to-teal-100 text-emerald-700",
];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user, signOut } = useAuth();
  const cartItemCount = getTotalItems();

  useEffect(() => {
    async function loadCategories() {
      try {
        const { fetchCategories } = await import("@/lib/categories");
        const data = await fetchCategories();
        setCategories(data);
      } catch (error) {
        console.error("Failed to load categories:", error);
      }
    }

    loadCategories();
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const loadFavorites = () => {
      try {
        const stored = localStorage.getItem("celebix_storefront_favorites");
        if (!stored) {
          setFavoritesCount(0);
          return;
        }

        const favorites = JSON.parse(stored);
        setFavoritesCount(Array.isArray(favorites) ? favorites.length : 0);
      } catch {
        setFavoritesCount(0);
      }
    };

    loadFavorites();
    window.addEventListener("storage", loadFavorites);

    return () => {
      window.removeEventListener("storage", loadFavorites);
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setSearchResults(searchProducts(searchQuery));
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const menuItems = [
    { icon: Home, label: "Ana Sayfa", href: ROUTES.home },
    { icon: ShoppingBag, label: "Tum Urunler", href: ROUTES.products },
    { icon: Heart, label: "Favorilerim", href: ROUTES.wishlist, badge: favoritesCount },
    { icon: User, label: user ? "Hesabim" : "Giris Yap", href: user ? "/hesap" : ROUTES.login },
  ];

  const quickCategoryCards =
    categories.length > 0
      ? categories.slice(0, 3).map((category) => ({
          href: ROUTES.category(category.slug),
          title: category.name,
          subtitle: `${category.productCount} urun`,
          shortLabel: category.name.slice(0, 2).toLocaleUpperCase("tr"),
        }))
      : [
          {
            href: ROUTES.products,
            title: "Tum Urunler",
            subtitle: "Katalog",
            shortLabel: "TU",
          },
          {
            href: `${ROUTES.products}?sort=featured`,
            title: "One Cikanlar",
            subtitle: "Secki",
            shortLabel: "OC",
          },
          {
            href: `${ROUTES.products}?sort=newest`,
            title: "Yeni Gelenler",
            subtitle: "Yeni",
            shortLabel: "YG",
          },
        ];

  const handleLogout = async () => {
    await signOut();
    setIsMenuOpen(false);
  };

  const closeSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchOpen(false);
  };

  const searchResultsPanel = searchResults.length > 0 && (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="absolute top-full left-0 right-0 z-[120] mt-2 overflow-hidden rounded-2xl border border-primary/5 bg-white shadow-2xl"
    >
      <div className="border-b border-primary/5 px-4 py-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-primary/40">
          Sonuclar ({searchResults.length})
        </span>
      </div>
      <div className="max-h-[360px] overflow-y-auto p-2">
        {searchResults.slice(0, 8).map((product) => (
          <Link
            key={product.id}
            href={ROUTES.product(product.slug)}
            className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-primary/5"
            onClick={closeSearch}
          >
            <div className="h-12 w-12 overflow-hidden rounded-xl bg-primary/5">
              <img
                src={product.images[0] ?? "/placeholder.svg"}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-900">{product.name}</p>
              <p className="text-xs font-medium text-gray-500">
                {product.variants[0]?.price ?? 0} TL
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </Link>
        ))}
      </div>
    </motion.div>
  );

  return (
    <header className="sticky top-0 z-[100] w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="flex items-center justify-center gap-2 border-b border-primary/5 bg-primary/5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
        <Truck className="h-3 w-3" />
        <span>{TOP_BAR_MESSAGE}</span>
      </div>

      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center gap-4 lg:h-20">
          <Link
            href={ROUTES.home}
            className="flex items-center gap-2 transition-transform duration-300 hover:scale-105"
          >
            <Image
              src={SITE_LOGO_PATH}
              alt={SITE_NAME}
              width={120}
              height={48}
              className="h-10 w-auto lg:h-12"
              priority
              sizes="120px"
            />
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-10 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group relative text-[13px] font-black uppercase tracking-widest text-gray-900/70 transition-all hover:text-primary"
              >
                {link.name}
                <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-primary transition-all group-hover:w-full" />
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <button
              className="hidden rounded-xl p-2.5 transition-all hover:bg-primary/5 sm:flex"
              onClick={() => setIsSearchOpen((current) => !current)}
              aria-label="Ara"
            >
              <Search className="h-5 w-5 text-gray-700 transition-colors hover:text-primary" />
            </button>

            <Link
              href={ROUTES.wishlist}
              className="hidden rounded-xl p-2.5 transition-all hover:bg-primary/5 sm:flex"
              aria-label="Favoriler"
            >
              <Heart className="h-5 w-5 text-gray-700 transition-colors hover:text-primary" />
            </Link>

            <Link
              href={user ? "/hesap" : ROUTES.login}
              className="hidden rounded-xl p-2.5 transition-all hover:bg-primary/5 sm:flex"
              aria-label={user ? "Hesabim" : "Giris Yap"}
            >
              <User className="h-5 w-5 text-gray-700 transition-colors hover:text-primary" />
            </Link>

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative rounded-xl bg-primary/5 p-2.5 transition-all hover:bg-primary/10"
              aria-label="Sepet"
            >
              <ShoppingBag className="h-6 w-6 text-primary" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-primary px-1 text-[10px] font-black text-white">
                  {cartItemCount}
                </span>
              ) : null}
            </button>

            <button
              className="rounded-xl p-2.5 transition-all hover:bg-primary/5 lg:hidden"
              onClick={() => setIsMenuOpen(true)}
              aria-label="Menuyu ac"
            >
              <Menu className="h-5 w-5 text-gray-700" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isSearchOpen ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="relative border-t border-gray-100 py-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                  <input
                    type="search"
                    placeholder="Urun veya kategori ara..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full rounded-xl border border-primary/10 bg-[#FFF5F5] py-3 pl-12 pr-10 text-sm font-medium text-primary transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/10"
                    autoFocus
                  />
                  {searchQuery ? (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-4 top-1/2 rounded-full p-1 transition-colors hover:bg-primary/5"
                    >
                      <X className="h-5 w-5 text-primary/40" />
                    </button>
                  ) : null}
                </div>

                <AnimatePresence>{searchResultsPanel}</AnimatePresence>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {isMenuOpen && typeof window !== "undefined"
        ? createPortal(
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[99998] bg-black/50 lg:hidden"
                onClick={() => setIsMenuOpen(false)}
              />
              <motion.aside
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 320 }}
                className="fixed inset-y-0 right-0 z-[99999] flex w-full flex-col overflow-hidden bg-white shadow-2xl lg:hidden"
              >
                <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={ROUTES.home} onClick={() => setIsMenuOpen(false)}>
                      <Image
                        src={SITE_LOGO_PATH}
                        alt={SITE_NAME}
                        width={84}
                        height={28}
                        className="h-7 w-auto"
                        sizes="84px"
                      />
                    </Link>

                    <div className="flex items-center gap-1">
                      <Link
                        href={ROUTES.wishlist}
                        onClick={() => setIsMenuOpen(false)}
                        className="relative rounded-xl p-2"
                      >
                        <Heart className="h-5 w-5 text-gray-700" />
                        {favoritesCount > 0 ? (
                          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                            {favoritesCount}
                          </span>
                        ) : null}
                      </Link>

                      <button
                        onClick={() => {
                          setIsCartOpen(true);
                          setIsMenuOpen(false);
                        }}
                        className="relative rounded-xl p-2"
                      >
                        <ShoppingBag className="h-5 w-5 text-gray-700" />
                        {cartItemCount > 0 ? (
                          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                            {cartItemCount}
                          </span>
                        ) : null}
                      </button>

                      <Link
                        href={user ? "/hesap" : ROUTES.login}
                        onClick={() => setIsMenuOpen(false)}
                        className="rounded-xl p-2"
                      >
                        <User className="h-5 w-5 text-gray-700" />
                      </Link>

                      <button onClick={() => setIsMenuOpen(false)} className="ml-1 rounded-xl p-2">
                        <X className="h-6 w-6 text-gray-700" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-white">
                  <div className="px-6 pb-4 pt-4">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Urun, kategori veya koleksiyon ara..."
                        className="w-full rounded-2xl border-2 border-gray-100 bg-white py-4 pl-12 pr-12 text-base outline-none transition-all focus:border-primary"
                      />
                      {searchQuery ? (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-4 top-1/2 rounded-full bg-gray-100 p-1 -translate-y-1/2"
                        >
                          <X className="h-4 w-4 text-gray-500" />
                        </button>
                      ) : null}
                    </div>

                    {searchResults.length > 0 ? (
                      <div className="mt-2 max-h-[300px] overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-xl">
                        <div className="p-2">
                          {searchResults.slice(0, 5).map((product) => (
                            <Link
                              key={product.id}
                              href={ROUTES.product(product.slug)}
                              onClick={() => {
                                setIsMenuOpen(false);
                                setSearchQuery("");
                              }}
                              className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50"
                            >
                              <img
                                src={product.images[0] ?? "/placeholder.svg"}
                                alt={product.name}
                                className="h-12 w-12 rounded-lg bg-gray-100 object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-gray-900">{product.name}</p>
                                <p className="text-xs text-gray-500">{product.variants[0]?.price ?? 0} TL</p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <nav className="space-y-1 px-6 pb-6">
                    {menuItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsMenuOpen(false)}
                        className="group flex items-center justify-between rounded-xl p-4 transition-colors hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 transition-all group-hover:bg-primary group-hover:text-white">
                            <item.icon className="h-5 w-5" />
                          </div>
                          <span className="text-base font-semibold text-gray-900">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {"badge" in item && item.badge ? (
                            <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                              {item.badge}
                            </span>
                          ) : null}
                          <ChevronRight className="h-5 w-5 text-gray-300 transition-colors group-hover:text-primary" />
                        </div>
                      </Link>
                    ))}
                  </nav>

                  <div className="px-6 pb-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
                        Kategoriler
                      </h3>
                      <Link
                        href="/koleksiyon"
                        onClick={() => setIsMenuOpen(false)}
                        className="text-xs font-semibold text-primary"
                      >
                        Tumunu Gor
                      </Link>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {quickCategoryCards.map((card, index) => (
                        <Link
                          key={card.href}
                          href={card.href}
                          onClick={() => setIsMenuOpen(false)}
                          className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:border-primary/50 hover:shadow-md active:scale-95"
                        >
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${quickCategoryTones[index % quickCategoryTones.length]}`}
                          >
                            <span className="text-sm font-black uppercase tracking-wide">
                              {card.shortLabel}
                            </span>
                          </div>
                          <div className="space-y-0.5 text-center leading-tight">
                            <span className="block text-[11px] font-bold text-gray-700">{card.title}</span>
                            <span className="block text-[10px] font-medium text-gray-500">
                              {card.subtitle}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>

                  {!user ? (
                    <div className="px-6 pb-6">
                      <div className="flex gap-3">
                        <Link
                          href={ROUTES.login}
                          onClick={() => setIsMenuOpen(false)}
                          className="flex-1 rounded-xl bg-primary py-3 text-center font-bold text-white"
                        >
                          Giris Yap
                        </Link>
                        <Link
                          href={ROUTES.register}
                          onClick={() => setIsMenuOpen(false)}
                          className="flex-1 rounded-xl border-2 border-primary py-3 text-center font-bold text-primary"
                        >
                          Kayit Ol
                        </Link>
                      </div>
                    </div>
                  ) : null}

                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-6">
                    <div className="mb-6 space-y-3">
                      <Link
                        href="/sss"
                        onClick={() => setIsMenuOpen(false)}
                        className="flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-white"
                      >
                        <div className="flex items-center gap-3">
                          <HelpCircle className="h-5 w-5 text-gray-500" />
                          <span className="text-sm font-medium text-gray-700">Sikca Sorulan Sorular</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </Link>

                      <a
                        href={`tel:${CONTACT_INFO.phone}`}
                        className="flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-white"
                      >
                        <div className="flex items-center gap-3">
                          <Phone className="h-5 w-5 text-gray-500" />
                          <div>
                            <span className="text-sm font-medium text-gray-700">Musteri Hizmetleri</span>
                            <p className="text-xs text-gray-500">{CONTACT_INFO.phone}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </a>
                    </div>

                    <div className="flex items-center justify-center gap-4 border-t border-gray-200 py-4">
                      <a
                        href={SOCIAL_LINKS.instagram}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 transition-all hover:bg-[#E4405F] hover:text-white"
                      >
                        <Instagram className="h-5 w-5" />
                      </a>
                      <a
                        href={SOCIAL_LINKS.facebook}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 transition-all hover:bg-[#1877F2] hover:text-white"
                      >
                        <Facebook className="h-5 w-5" />
                      </a>
                    </div>

                    {user ? (
                      <button
                        onClick={handleLogout}
                        className="mt-4 w-full rounded-xl border-2 border-gray-200 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100"
                      >
                        Cikis Yap
                      </button>
                    ) : null}

                    <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      © {new Date().getFullYear()} {SITE_NAME}
                    </p>
                  </div>
                </div>
              </motion.aside>
            </AnimatePresence>,
            document.body
          )
        : null}
    </header>
  );
}
