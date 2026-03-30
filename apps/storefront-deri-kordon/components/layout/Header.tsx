"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
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
import { useStoreInfo } from "@/lib/store-info-context";
import { searchProducts } from "@/lib/products";
import type { Product, CategoryInfo } from "@/types/product";

interface HeaderProps {
  transparent?: boolean;
}

export function Header({ transparent = false }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user, signOut } = useAuth();
  const { storeInfo } = useStoreInfo();
  const cartItemCount = getTotalItems();
  const previousBodyOverflowRef = useRef<string | null>(null);

  // Scroll detection for header styling
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
    if (isMenuOpen) {
      previousBodyOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousBodyOverflowRef.current ?? "";
        previousBodyOverflowRef.current = null;
      };
    }

    if (previousBodyOverflowRef.current !== null) {
      document.body.style.overflow = previousBodyOverflowRef.current;
      previousBodyOverflowRef.current = null;
    }
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
    return () => window.removeEventListener("storage", loadFavorites);
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

  const handleLogout = async () => {
    await signOut();
    setIsMenuOpen(false);
  };

  const closeSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchOpen(false);
  };

  const logoSrc = storeInfo?.logoUrl || SITE_LOGO_PATH;
  const logoAlt = storeInfo?.name || SITE_NAME;

  // Determine header style based on transparent prop and scroll state
  const isTransparent = transparent && !isScrolled;

  return (
    <>
      {/* Top Bar - Hidden when transparent header on hero */}
      {!isTransparent && (
        <div className="bg-[#0F1626] text-white py-2.5">
          <div className="container-premium flex items-center justify-center gap-2 text-xs tracking-wider uppercase">
            <Truck className="h-3.5 w-3.5 text-[#8A6B37]" />
            <span className="text-white/90">{TOP_BAR_MESSAGE}</span>
          </div>
        </div>
      )}

      {/* Main Header */}
      <header 
        className={`${isTransparent ? 'absolute' : 'sticky'} top-0 z-[100] w-full transition-all duration-500 ${
          isScrolled 
            ? "bg-white/95 backdrop-blur-md shadow-sm" 
            : isTransparent
              ? "bg-transparent"
              : "bg-white"
        }`}
      >
        <div className="container-premium">
          <div className="flex h-16 lg:h-20 items-center justify-between">
            {/* Mobile Menu Button */}
            <button
              className={`lg:hidden p-2 -ml-2 rounded-lg transition-colors ${
                isTransparent && !isScrolled 
                  ? "text-white hover:bg-white/10" 
                  : "text-[#0F1626] hover:bg-[#0F1626]/5"
              }`}
              onClick={() => setIsMenuOpen(true)}
              aria-label="Menüyü aç"
            >
              <Menu className={`h-5 w-5 ${isTransparent && !isScrolled ? "text-white" : "text-[#0F1626]"}`} />
            </button>

            {/* Logo */}
            <Link
              href={ROUTES.home}
              className="relative flex h-10 w-[148px] items-center transition-transform duration-300 hover:scale-[1.02] sm:w-[164px] lg:h-12 lg:w-[188px]"
              aria-label={logoAlt}
            >
              <Image
                src={logoSrc}
                alt={logoAlt}
                fill
                className="object-contain object-left"
                priority
                sizes="(max-width: 640px) 148px, (max-width: 1024px) 164px, 188px"
                unoptimized={logoSrc.startsWith("http")}
              />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-10">
              {[
                { name: "Ana Sayfa", href: ROUTES.home },
                { name: "Koleksiyon", href: ROUTES.products },
                { name: "Hakkımızda", href: "/hakkimizda" },
                { name: "İletişim", href: ROUTES.contact },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative text-sm font-medium transition-colors tracking-wide group ${
                    isTransparent && !isScrolled 
                      ? "text-white/80 hover:text-white" 
                      : "text-[#0F1626]/80 hover:text-[#0F1626]"
                  }`}
                >
                  {link.name}
                  <span className={`absolute -bottom-1 left-0 w-0 h-[2px] transition-all duration-300 group-hover:w-full ${
                    isTransparent && !isScrolled ? "bg-white" : "bg-[#8A6B37]"
                  }`} />
                </Link>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Search */}
              <button
                className={`p-2.5 rounded-lg transition-colors ${
                  isTransparent && !isScrolled 
                    ? "text-white hover:bg-white/10" 
                    : "text-[#0F1626] hover:bg-[#0F1626]/5"
                }`}
                onClick={() => setIsSearchOpen(true)}
                aria-label="Ara"
              >
                <Search className={`h-5 w-5 ${isTransparent && !isScrolled ? "text-white" : "text-[#0F1626]"}`} />
              </button>

              {/* Wishlist - Desktop */}
              <Link
                href={ROUTES.wishlist}
                className={`hidden sm:flex p-2.5 rounded-lg transition-colors relative ${
                  isTransparent && !isScrolled 
                    ? "text-white hover:bg-white/10" 
                    : "text-[#0F1626] hover:bg-[#0F1626]/5"
                }`}
                aria-label="Favoriler"
              >
                <Heart className={`h-5 w-5 ${isTransparent && !isScrolled ? "text-white" : "text-[#0F1626]"}`} />
                {favoritesCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-[#8A6B37] text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                    {favoritesCount}
                  </span>
                )}
              </Link>

              {/* Account - Desktop */}
              <Link
                href={user ? "/hesap" : ROUTES.login}
                className={`hidden sm:flex p-2.5 rounded-lg transition-colors ${
                  isTransparent && !isScrolled 
                    ? "text-white hover:bg-white/10" 
                    : "text-[#0F1626] hover:bg-[#0F1626]/5"
                }`}
                aria-label={user ? "Hesabım" : "Giriş Yap"}
              >
                <User className={`h-5 w-5 ${isTransparent && !isScrolled ? "text-white" : "text-[#0F1626]"}`} />
              </Link>

              {/* Cart */}
              <button
                onClick={() => setIsCartOpen(true)}
                className={`relative p-2.5 rounded-lg transition-colors ${
                  isTransparent && !isScrolled 
                    ? "bg-white text-[#0F1626] hover:bg-white/90" 
                    : "bg-[#0F1626] text-white hover:bg-[#0F1626]/90"
                }`}
                aria-label="Sepet"
              >
                <ShoppingBag className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <span className={`absolute -top-1 -right-1 w-5 h-5 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 ${
                    isTransparent && !isScrolled ? "border-white bg-[#8A6B37]" : "border-white bg-[#8A6B37]"
                  }`}>
                    {cartItemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Search Overlay */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
            onClick={closeSearch}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-0 left-0 right-0 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="container-premium py-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#0F1626]/40" />
                  <input
                    type="search"
                    placeholder="Ürün, kategori veya koleksiyon ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#E5E2DE] rounded-xl py-4 pl-12 pr-12 text-[#0F1626] placeholder:text-[#0F1626]/40 focus:outline-none focus:border-[#8A6B37] focus:ring-1 focus:ring-[#8A6B37]"
                    autoFocus
                  />
                  <button
                    onClick={closeSearch}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-[#0F1626]/5"
                  >
                    <X className="h-5 w-5 text-[#0F1626]/60" />
                  </button>
                </div>

                {/* Search Results */}
                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mt-4 bg-white rounded-xl border border-[#E5E2DE] overflow-hidden"
                    >
                      <div className="p-3 border-b border-[#E5E2DE] bg-[#F8F8F8]">
                        <span className="text-xs font-medium text-[#0F1626]/60 uppercase tracking-wider">
                          Sonuçlar ({searchResults.length})
                        </span>
                      </div>
                      <div className="max-h-[320px] overflow-y-auto">
                        {searchResults.slice(0, 6).map((product) => (
                          <Link
                            key={product.id}
                            href={ROUTES.product(product.slug)}
                            className="flex items-center gap-4 p-3 hover:bg-[#F8F8F8] transition-colors"
                            onClick={closeSearch}
                          >
                            <div className="w-14 h-14 rounded-lg bg-[#F5F3F0] overflow-hidden">
                              <img
                                src={product.images[0] ?? "/placeholder.svg"}
                                alt={product.name}
                                draggable={false}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-[#0F1626] truncate">{product.name}</p>
                              <p className="text-sm text-[#8A6B37] font-semibold">
                                {product.variants[0]?.price ?? 0} TL
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-[#0F1626]/30" />
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Menu */}
      {isMenuOpen && typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[99998] bg-black/50 lg:hidden"
              onClick={() => setIsMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-[99999] w-full max-w-sm bg-white shadow-2xl lg:hidden overflow-hidden flex flex-col"
            >
              {/* Menu Header */}
              <div className="flex items-center justify-between p-4 border-b border-[#E5E2DE]">
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  width={160}
                  height={40}
                  className="h-8 w-auto"
                  priority
                  sizes="160px"
                  unoptimized
                />
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-[#0F1626]/5"
                >
                  <X className="h-5 w-5 text-[#0F1626]" />
                </button>
              </div>

              {/* Menu Content */}
              <div className="flex-1 overflow-y-auto">
                {/* User Actions */}
                <div className="p-4 grid grid-cols-3 gap-2 border-b border-[#E5E2DE]">
                  <Link
                    href={ROUTES.wishlist}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#F8F8F8] hover:bg-[#0F1626]/5 transition-colors"
                  >
                    <Heart className="h-5 w-5 text-[#0F1626]" />
                    <span className="text-xs font-medium">Favoriler</span>
                  </Link>
                  <Link
                    href={user ? "/hesap" : ROUTES.login}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#F8F8F8] hover:bg-[#0F1626]/5 transition-colors"
                  >
                    <User className="h-5 w-5 text-[#0F1626]" />
                    <span className="text-xs font-medium">
                      {user ? "Hesabım" : "Giriş"}
                    </span>
                  </Link>
                  <button
                    onClick={() => {
                      setIsCartOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#F8F8F8] hover:bg-[#0F1626]/5 transition-colors"
                  >
                    <ShoppingBag className="h-5 w-5 text-[#0F1626]" />
                    <span className="text-xs font-medium">Sepet</span>
                  </button>
                </div>

                {/* Navigation Links */}
                <nav className="p-4 space-y-1">
                  {[
                    { icon: Home, label: "Ana Sayfa", href: ROUTES.home },
                    { icon: ShoppingBag, label: "Koleksiyon", href: ROUTES.products },
                    { icon: HelpCircle, label: "Hakkımızda", href: "/hakkimizda" },
                    { icon: Phone, label: "İletişim", href: ROUTES.contact },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-4 p-4 rounded-xl hover:bg-[#F8F8F8] transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-[#F5F3F0] flex items-center justify-center group-hover:bg-[#8A6B37] transition-colors">
                        <item.icon className="h-5 w-5 text-[#0F1626] group-hover:text-white transition-colors" />
                      </div>
                      <span className="font-medium text-[#0F1626]">{item.label}</span>
                      <ChevronRight className="h-4 w-4 text-[#0F1626]/30 ml-auto" />
                    </Link>
                  ))}
                </nav>

                {/* Categories */}
                {categories.length > 0 && (
                  <div className="p-4 border-t border-[#E5E2DE]">
                    <h3 className="text-xs font-semibold text-[#0F1626]/60 uppercase tracking-wider mb-3">
                      Kategoriler
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.slice(0, 4).map((cat) => (
                        <Link
                          key={cat.slug}
                          href={ROUTES.category(cat.slug)}
                          onClick={() => setIsMenuOpen(false)}
                          className="p-3 rounded-lg bg-[#F8F8F8] hover:bg-[#0F1626] hover:text-white transition-colors text-sm font-medium text-center"
                        >
                          {cat.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Menu Footer */}
              <div className="p-4 bg-[#0F1626] text-white">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <a
                    href={SOCIAL_LINKS.instagram}
                    target="_blank"
                    rel="noreferrer"
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#8A6B37] transition-colors"
                  >
                    <Instagram className="h-5 w-5" />
                  </a>
                </div>
                <p className="text-center text-xs text-white/60">
                  © {new Date().getFullYear()} {SITE_NAME}
                </p>
              </div>
            </motion.aside>
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
