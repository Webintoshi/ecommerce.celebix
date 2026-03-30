"use client";

import { useEffect, useState } from "react";
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

// Scroll Progress Component
function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = window.scrollY;
      const progress = scrollHeight > 0 ? (scrolled / scrollHeight) * 100 : 0;
      setProgress(progress);
    };

    window.addEventListener("scroll", updateProgress, { passive: true });
    return () => window.removeEventListener("scroll", updateProgress);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-[2px] z-[101] bg-transparent">
      <motion.div
        className="h-full bg-gradient-to-r from-[#8A6B37] via-[#A67C3D] to-[#8A6B37]"
        style={{ width: `${progress}%` }}
        initial={{ width: "0%" }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
}

export function Header({ transparent = false }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user, signOut } = useAuth();
  const { storeInfo } = useStoreInfo();
  const cartItemCount = getTotalItems();

  // Scroll detection for header styling and hide/show
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Determine if scrolled past threshold
      setIsScrolled(currentScrollY > 50);
      
      // Hide/show header on scroll direction (only after 200px scroll)
      if (currentScrollY > 200) {
        if (currentScrollY > lastScrollY) {
          // Scrolling down
          setIsVisible(false);
        } else {
          // Scrolling up
          setIsVisible(true);
        }
      } else {
        setIsVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };
    
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

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

  // Navigation items with icons
  const navItems = [
    { name: "Ana Sayfa", href: ROUTES.home },
    { name: "Koleksiyon", href: ROUTES.products },
    { name: "Hakkımızda", href: "/hakkimizda" },
    { name: "İletişim", href: ROUTES.contact },
  ];

  return (
    <>
      <ScrollProgress />
      
      {/* Top Bar - Hidden when transparent header on hero */}
      <AnimatePresence>
        {!isTransparent && isVisible && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-[#0F1626] text-white py-2.5"
          >
            <div className="container-premium flex items-center justify-center gap-2 text-xs tracking-wider uppercase">
              <Truck className="h-3.5 w-3.5 text-[#8A6B37]" />
              <span className="text-white/90">{TOP_BAR_MESSAGE}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Header */}
      <motion.header 
        initial={{ y: 0 }}
        animate={{ y: isVisible ? 0 : -100 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`lg:hidden p-2 -ml-2 rounded-lg transition-colors ${
                isTransparent && !isScrolled 
                  ? "text-white hover:bg-white/10" 
                  : "text-[#0F1626] hover:bg-[#0F1626]/5"
              }`}
              onClick={() => setIsMenuOpen(true)}
              aria-label="Menüyü aç"
            >
              <Menu className={`h-5 w-5 ${isTransparent && !isScrolled ? "text-white" : "text-[#0F1626]"}`} />
            </motion.button>

            {/* Logo */}
            <Link
              href={ROUTES.home}
              className="relative flex h-10 w-[148px] items-center transition-all duration-300 hover:scale-[1.02] sm:w-[164px] lg:h-12 lg:w-[188px]"
              aria-label={logoAlt}
            >
              <motion.div
                animate={{
                  scale: isScrolled ? 0.9 : 1,
                  y: isScrolled ? -2 : 0,
                }}
                transition={{ duration: 0.3 }}
                className="relative w-full h-full"
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
              </motion.div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-10">
              {navItems.map((link, index) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link
                    href={link.href}
                    className={`relative text-sm font-medium transition-colors tracking-wide group py-2 ${
                      isTransparent && !isScrolled 
                        ? "text-white/80 hover:text-white" 
                        : "text-[#0F1626]/80 hover:text-[#0F1626]"
                    }`}
                  >
                    {link.name}
                    <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[2px] transition-all duration-300 group-hover:w-full ${
                      isTransparent && !isScrolled ? "bg-white" : "bg-[#8A6B37]"
                    }`} />
                  </Link>
                </motion.div>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Search */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={`p-2.5 rounded-lg transition-colors ${
                  isTransparent && !isScrolled 
                    ? "text-white hover:bg-white/10" 
                    : "text-[#0F1626] hover:bg-[#0F1626]/5"
                }`}
                onClick={() => setIsSearchOpen(true)}
                aria-label="Ara"
              >
                <Search className={`h-5 w-5 ${isTransparent && !isScrolled ? "text-white" : "text-[#0F1626]"}`} />
              </motion.button>

              {/* Wishlist - Desktop */}
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
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
                  <AnimatePresence>
                    {favoritesCount > 0 && (
                      <motion.span 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="absolute top-1 right-1 w-4 h-4 bg-[#8A6B37] text-white text-[10px] font-medium rounded-full flex items-center justify-center"
                      >
                        {favoritesCount}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              </motion.div>

              {/* Account - Desktop */}
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
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
              </motion.div>

              {/* Cart */}
              <motion.button
                onClick={() => setIsCartOpen(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`relative p-2.5 rounded-lg transition-all ${
                  isTransparent && !isScrolled 
                    ? "bg-white text-[#0F1626] hover:bg-white/90 hover:shadow-lg" 
                    : "bg-[#0F1626] text-white hover:bg-[#0F1626]/90 hover:shadow-lg"
                }`}
                aria-label="Sepet"
              >
                <ShoppingBag className="h-5 w-5" />
                <AnimatePresence>
                  {cartItemCount > 0 && (
                    <motion.span 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className={`absolute -top-1.5 -right-1.5 w-5 h-5 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 ${
                        isTransparent && !isScrolled ? "border-white bg-[#8A6B37]" : "border-white bg-[#8A6B37]"
                      }`}
                    >
                      {cartItemCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Search Overlay */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            onClick={closeSearch}
          >
            <motion.div
              initial={{ opacity: 0, y: -30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute top-0 left-0 right-0 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="container-premium py-8">
                <div className="relative max-w-2xl mx-auto">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-[#0F1626]/40" />
                  <input
                    type="search"
                    placeholder="Ürün, kategori veya koleksiyon ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#F8F8F8] border-2 border-[#E5E2DE] rounded-2xl py-5 pl-14 pr-14 text-lg text-[#0F1626] placeholder:text-[#0F1626]/40 focus:outline-none focus:border-[#8A6B37] focus:ring-4 focus:ring-[#8A6B37]/10 transition-all"
                    autoFocus
                  />
                  <motion.button
                    onClick={closeSearch}
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute right-5 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-[#0F1626]/5 transition-colors"
                  >
                    <X className="h-6 w-6 text-[#0F1626]/60" />
                  </motion.button>
                </div>

                {/* Search Results */}
                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="mt-6 max-w-2xl mx-auto bg-white rounded-2xl border border-[#E5E2DE] overflow-hidden shadow-xl"
                    >
                      <div className="p-4 border-b border-[#E5E2DE] bg-[#F8F8F8]">
                        <span className="text-xs font-medium text-[#0F1626]/60 uppercase tracking-wider">
                          Sonuçlar ({searchResults.length})
                        </span>
                      </div>
                      <div className="max-h-[400px] overflow-y-auto">
                        {searchResults.slice(0, 6).map((product, index) => (
                          <motion.div
                            key={product.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <Link
                              href={ROUTES.product(product.slug)}
                              className="flex items-center gap-4 p-4 hover:bg-[#F8F8F8] transition-colors group"
                              onClick={closeSearch}
                            >
                              <div className="w-16 h-16 rounded-xl bg-[#F5F3F0] overflow-hidden flex-shrink-0">
                                <img
                                  src={product.images[0] ?? "/placeholder.svg"}
                                  alt={product.name}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-[#0F1626] truncate group-hover:text-[#8A6B37] transition-colors">
                                  {product.name}
                                </p>
                                <p className="text-sm text-[#8A6B37] font-semibold">
                                  {product.variants[0]?.price ?? 0} TL
                                </p>
                              </div>
                              <ChevronRight className="h-5 w-5 text-[#0F1626]/30 group-hover:text-[#8A6B37] group-hover:translate-x-1 transition-all" />
                            </Link>
                          </motion.div>
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
              className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm lg:hidden"
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
                <motion.button
                  onClick={() => setIsMenuOpen(false)}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-2 rounded-lg hover:bg-[#0F1626]/5"
                >
                  <X className="h-5 w-5 text-[#0F1626]" />
                </motion.button>
              </div>

              {/* Menu Content */}
              <div className="flex-1 overflow-y-auto">
                {/* User Actions */}
                <div className="p-4 grid grid-cols-3 gap-2 border-b border-[#E5E2DE]">
                  {[
                    { icon: Heart, label: "Favoriler", href: ROUTES.wishlist },
                    { icon: User, label: user ? "Hesabım" : "Giriş", href: user ? "/hesap" : ROUTES.login },
                    { icon: ShoppingBag, label: "Sepet", onClick: () => { setIsCartOpen(true); setIsMenuOpen(false); } },
                  ].map((item, index) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      {item.href ? (
                        <Link
                          href={item.href}
                          onClick={() => setIsMenuOpen(false)}
                          className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#F8F8F8] hover:bg-[#0F1626] hover:text-white transition-all group"
                        >
                          <item.icon className="h-5 w-5 text-[#0F1626] group-hover:text-white transition-colors" />
                          <span className="text-xs font-medium">{item.label}</span>
                        </Link>
                      ) : (
                        <button
                          onClick={item.onClick}
                          className="w-full flex flex-col items-center gap-2 p-3 rounded-xl bg-[#F8F8F8] hover:bg-[#0F1626] hover:text-white transition-all group"
                        >
                          <item.icon className="h-5 w-5 text-[#0F1626] group-hover:text-white transition-colors" />
                          <span className="text-xs font-medium">{item.label}</span>
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Navigation Links */}
                <nav className="p-4 space-y-1">
                  {[
                    { icon: Home, label: "Ana Sayfa", href: ROUTES.home },
                    { icon: ShoppingBag, label: "Koleksiyon", href: ROUTES.products },
                    { icon: HelpCircle, label: "Hakkımızda", href: "/hakkimizda" },
                    { icon: Phone, label: "İletişim", href: ROUTES.contact },
                  ].map((item, index) => (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setIsMenuOpen(false)}
                        className="flex items-center gap-4 p-4 rounded-xl hover:bg-[#F8F8F8] transition-colors group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-[#F5F3F0] flex items-center justify-center group-hover:bg-[#8A6B37] transition-colors">
                          <item.icon className="h-5 w-5 text-[#0F1626] group-hover:text-white transition-colors" />
                        </div>
                        <span className="font-medium text-[#0F1626]">{item.label}</span>
                        <ChevronRight className="h-4 w-4 text-[#0F1626]/30 ml-auto group-hover:text-[#8A6B37] group-hover:translate-x-1 transition-all" />
                      </Link>
                    </motion.div>
                  ))}
                </nav>

                {/* Categories */}
                {categories.length > 0 && (
                  <div className="p-4 border-t border-[#E5E2DE]">
                    <h3 className="text-xs font-semibold text-[#0F1626]/60 uppercase tracking-wider mb-3">
                      Kategoriler
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.slice(0, 4).map((cat, index) => (
                        <motion.div
                          key={cat.slug}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.6 + index * 0.05 }}
                        >
                          <Link
                            href={ROUTES.category(cat.slug)}
                            onClick={() => setIsMenuOpen(false)}
                            className="p-3 rounded-lg bg-[#F8F8F8] hover:bg-[#0F1626] hover:text-white transition-all text-sm font-medium text-center block"
                          >
                            {cat.name}
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Menu Footer */}
              <div className="p-4 bg-[#0F1626] text-white">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <motion.a
                    href={SOCIAL_LINKS.instagram}
                    target="_blank"
                    rel="noreferrer"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#8A6B37] transition-colors"
                    aria-label="Instagram"
                  >
                    <Instagram className="h-5 w-5" />
                  </motion.a>
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
