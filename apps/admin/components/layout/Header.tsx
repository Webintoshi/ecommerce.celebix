"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { STORE_RUNTIME, buildStorefrontProductUrl } from "@/lib/store-runtime";
import {
  Search,
  Menu,
  X,
  Heart,
  ChevronRight,
  Home,
  Truck,
  User,
  ShoppingBag,
  HelpCircle,
  Phone,
  Instagram,
  Facebook,
  Sprout,
  Cookie,
  Wheat,
} from "lucide-react";
import { SITE_NAME, NAV_LINKS, ROUTES, CONTACT_INFO, SOCIAL_LINKS } from "@/lib/constants";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { useStoreInfo } from "@/lib/store-info-context";
import { CategoryInfo } from "@/types/product";

import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { searchProducts } from "@/lib/products";
import { Product } from "@/types/product";

// Stagger animations
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: 20 },
  show: { opacity: 1, x: 0 }
};

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const { getTotalItems, setIsOpen: setIsCartOpen } = useCart();
  const { user, signOut } = useAuth();
  const { storeInfo } = useStoreInfo();
  const cartItemCount = getTotalItems();
  const cartControls = useAnimation();
  const prevCartCountRef = useRef(cartItemCount);
  
  // Premium menu states
  const [favoritesCount, setFavoritesCount] = useState(0);

  // Load categories from Supabase
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
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  // Load favorites count
  useEffect(() => {
    const loadFavorites = () => {
      try {
        const stored = localStorage.getItem("celebix_favorites");
        if (stored) {
          const favorites = JSON.parse(stored);
          setFavoritesCount(Array.isArray(favorites) ? favorites.length : 0);
        }
      } catch {
        setFavoritesCount(0);
      }
    };
    loadFavorites();
    
    // Listen for favorites changes
    const handleStorage = () => loadFavorites();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [isMenuOpen]);

  // AJAX Search Logic
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        setSearchResults(searchProducts(searchQuery));
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Cart Animation Logic
  useEffect(() => {
    if (cartItemCount > prevCartCountRef.current) {
      cartControls.start({
        scale: [1, 1.3, 1],
        transition: { duration: 0.3 }
      });
    }
    prevCartCountRef.current = cartItemCount;
  }, [cartItemCount, cartControls]);

  const handleLogout = async () => {
    await signOut();
    setIsMenuOpen(false);
  };

  const logoSrc = storeInfo?.logoUrl || "/logo.webp";
  const logoAlt = storeInfo?.name || SITE_NAME;

  // Menu items for navigation
  const menuItems = [
    { icon: Home, label: "Ana Sayfa", href: "/" },
    { icon: ShoppingBag, label: "Tüm Ürünler", href: "/urunler" },
    { icon: Heart, label: "Favorilerim", href: "/favoriler", badge: favoritesCount },
    { icon: User, label: "Hesabım", href: "/hesap" },
  ];

  return (
    <header className="sticky top-0 z-[100] w-full bg-white/80 backdrop-blur-md border-b border-gray-100 transition-all duration-300">
      {/* Top Bar */}
      <div className="bg-primary/5 border-b border-primary/5 text-[10px] font-bold text-primary uppercase tracking-[0.2em] py-1.5 flex justify-center items-center gap-2">
        <Truck className="h-3 w-3" />
        <span>500 ₺ Üzeri Siparişlerde Ücretsiz Kargo</span>
      </div>

      <div className="container mx-auto px-4">
        <div className="flex h-16 lg:h-20 items-center gap-4">
          {/* LOGO */}
          <Link href={ROUTES.home} className="flex items-center gap-2 transform hover:scale-105 transition-transform duration-300">
            <Image 
              src={logoSrc} 
              alt={logoAlt} 
              width={120}
              height={48}
              className="h-10 lg:h-12 w-auto"
              priority
              sizes="120px"
              unoptimized={logoSrc.startsWith("http")}
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-10 flex-1 justify-center">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13px] font-black uppercase tracking-widest text-gray-900/70 hover:text-primary transition-all relative group"
              >
                {link.name}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all group-hover:w-full" />
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-3 ml-auto">
            {/* 1. Search - Desktop only */}
            <button
              className="hidden sm:flex p-2.5 hover:bg-primary/5 rounded-xl transition-all group"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              aria-label="Ara"
            >
              <Search className="h-5 w-5 text-gray-700 group-hover:text-primary transition-colors" />
            </button>

            {/* 2. Favorites - Desktop only */}
            <Link
              href="/favoriler"
              className="hidden sm:flex p-2.5 hover:bg-primary/5 rounded-xl transition-all group"
              aria-label="Favoriler"
            >
              <Heart className="h-5 w-5 text-gray-700 group-hover:text-primary transition-colors" />
            </Link>

            {/* 3. Account - Desktop only */}
            {user ? (
              <Link
                href="/hesap"
                className="hidden sm:flex items-center gap-2 p-2.5 hover:bg-primary/5 rounded-xl transition-all group"
                aria-label="Hesabım"
              >
                <User className="h-5 w-5 text-gray-700 group-hover:text-primary transition-colors" />
              </Link>
            ) : (
              <Link
                href="/giris"
                className="hidden sm:flex items-center gap-2 p-2.5 hover:bg-primary/5 rounded-xl transition-all group"
                aria-label="Giriş Yap"
              >
                <User className="h-5 w-5 text-gray-700 group-hover:text-primary transition-colors" />
              </Link>
            )}

            {/* 4. Cart - Always visible */}
            <motion.button
              onClick={() => setIsCartOpen(true)}
              animate={cartControls}
              className="relative p-2.5 bg-primary/5 hover:bg-primary/10 rounded-xl transition-all group"
              aria-label="Sepet"
            >
              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6 text-primary"
                >
                  <path d="M16 8V6a2 2 0 0 0-2-2H9.5a2 2 0 0 0-2 2v2" />
                  <path d="M7 8h10" />
                  <path d="M6 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
                  <path d="M9.5 13a2.5 2.5 0 0 1 5 0" />
                </svg>
                {cartItemCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-3 -right-3 h-[18px] min-w-[18px] px-1 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm z-20"
                  >
                    {cartItemCount}
                  </motion.span>
                )}
              </div>
            </motion.button>

            {/* 5. Mobile Menu Toggle - En sağda */}
            <button
              className="lg:hidden p-2.5 hover:bg-primary/5 rounded-xl transition-all"
              onClick={() => setIsMenuOpen(true)}
              aria-label="Menüyü aç"
            >
              <Menu className="h-5 w-5 text-gray-700" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="py-4 border-t border-gray-100 relative">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                  <input
                    type="search"
                    placeholder="Ürün veya kategori ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-primary/10 bg-[#FFF5F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all text-sm font-medium text-primary"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-primary/5 rounded-full transition-colors"
                    >
                      <X className="h-5 w-5 text-primary/40" />
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 right-0 z-[110] mt-2 bg-white rounded-2xl shadow-2xl border border-primary/5 overflow-hidden max-h-[400px] overflow-y-auto"
                    >
                      <div className="p-2">
                        <div className="px-4 py-2 border-b border-primary/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary/40">Sonuçlar ({searchResults.length})</span>
                        </div>
                        {searchResults.map((product) => (
                          <Link
                            key={product.id}
                            href={buildStorefrontProductUrl(product.slug)}
                            className="flex items-center gap-4 p-3 hover:bg-primary/5 rounded-xl transition-colors group"
                            onClick={() => {
                              setIsSearchOpen(false);
                              setSearchQuery("");
                            }}
                          >
                            <div className="w-12 h-12 rounded-lg bg-primary/5 overflow-hidden flex-shrink-0">
                              <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-black text-primary uppercase tracking-wider truncate">{product.name}</h4>
                              <p className="text-[11px] font-bold text-primary/60">{product.variants[0].price} ₺'den başlayan fiyatlarla</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-primary/20 group-hover:text-primary transition-colors" />
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* PREMIUM MOBILE MENU - Portal to body */}
      {isMenuOpen && typeof window !== 'undefined' && createPortal(
        <AnimatePresence>
          {isMenuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMenuOpen(false)}
                className="fixed inset-0 bg-black/50 z-[99998] lg:hidden"
              />
              {/* Menu Panel */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed inset-y-0 right-0 w-full bg-white z-[99999] lg:hidden flex flex-col shadow-2xl overflow-hidden"
              >
                {/* Sticky Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0">
                  <Link href="/" onClick={() => setIsMenuOpen(false)}>
                    <Image 
                      src="/logo.webp" 
                      alt={SITE_NAME} 
                      width={84}
                      height={28}
                      className="h-7 w-auto"
                      sizes="84px"
                    />
                  </Link>
                  <div className="flex items-center gap-1">
                    <Link href="/favoriler" onClick={() => setIsMenuOpen(false)} className="relative p-2">
                      <Heart className="w-5 h-5 text-gray-700" />
                      {favoritesCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                          {favoritesCount}
                        </span>
                      )}
                    </Link>
                    <button onClick={() => { setIsCartOpen(true); setIsMenuOpen(false); }} className="relative p-2">
                      <ShoppingBag className="w-5 h-5 text-gray-700" />
                      {cartItemCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                          {cartItemCount}
                        </span>
                      )}
                    </button>
                    <Link href="/hesap" onClick={() => setIsMenuOpen(false)} className="p-2">
                      <User className="w-5 h-5 text-gray-700" />
                    </Link>
                    <button
                      onClick={() => setIsMenuOpen(false)}
                      className="p-2 ml-1"
                    >
                      <X className="h-6 w-6 text-gray-700" />
                    </button>
                  </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto bg-white">
                  {/* Integrated Search */}
                  <div className="px-6 pb-4">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Ürün, kategori veya ara..."
                        className="w-full pl-12 pr-12 py-4 bg-white border-2 border-gray-100 focus:border-primary rounded-2xl focus:outline-none focus:ring-0 transition-all text-base"
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 bg-gray-100 rounded-full">
                          <X className="w-4 h-4 text-gray-500" />
                        </button>
                      )}
                    </div>
                    
                    {/* Search Results */}
                    {searchResults.length > 0 && (
                      <div className="mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden max-h-[300px] overflow-y-auto">
                        <div className="p-2">
                          {searchResults.slice(0, 5).map((product) => (
                            <Link
                              key={product.id}
                              href={buildStorefrontProductUrl(product.slug)}
                              className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl transition-colors"
                              onClick={() => {
                                setIsMenuOpen(false);
                                setSearchQuery("");
                              }}
                            >
                              <img src={product.images[0]} alt={product.name} className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-gray-900 text-sm truncate">{product.name}</h4>
                                <p className="text-xs text-gray-500">{product.variants[0].price} ₺</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Navigation Links */}
                  <nav className="px-6 pb-6 space-y-1">
                    {menuItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsMenuOpen(false)}
                        className="flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                            <item.icon className="w-5 h-5" />
                          </div>
                          <span className="text-base font-semibold text-gray-900">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.badge ? (
                            <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg">
                              {item.badge}
                            </span>
                          ) : null}
                          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </nav>

                  {/* Compact Categories Grid - Lucide Icons */}
                  <div className="px-6 pb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Kategoriler</h3>
                      <Link href="/koleksiyon" onClick={() => setIsMenuOpen(false)} className="text-xs text-primary font-semibold">
                        Tümünü Gör
                      </Link>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      {/* Fındık Ezmesi */}
                      <Link
                        href="/koleksiyon/findik-ezmesi"
                        onClick={() => setIsMenuOpen(false)}
                        className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-gray-100 active:scale-95 transition-all hover:border-primary/50 hover:shadow-md"
                      >
                        <div className="w-12 h-12 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl flex items-center justify-center">
                          <Sprout className="w-6 h-6 text-amber-700" strokeWidth={1.5} />
                        </div>
                        <span className="text-[11px] font-bold text-gray-700 text-center leading-tight">
                          Fındık<br/>Ezmesi
                        </span>
                      </Link>

                      {/* Fıstık Ezmesi */}
                      <Link
                        href="/koleksiyon/fistik-ezmesi"
                        onClick={() => setIsMenuOpen(false)}
                        className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-gray-100 active:scale-95 transition-all hover:border-primary/50 hover:shadow-md"
                      >
                        <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-red-100 rounded-2xl flex items-center justify-center">
                          <img 
                            src="/icons/peanut-butter.svg" 
                            alt="Fıstık Ezmesi" 
                            className="w-7 h-7"
                          />
                        </div>
                        <span className="text-[11px] font-bold text-gray-700 text-center leading-tight">
                          Fıstık<br/>Ezmesi
                        </span>
                      </Link>

                      {/* Kuruyemişler */}
                      <Link
                        href="/koleksiyon/kuruyemisler"
                        onClick={() => setIsMenuOpen(false)}
                        className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-gray-100 active:scale-95 transition-all hover:border-primary/50 hover:shadow-md"
                      >
                        <div className="w-12 h-12 bg-gradient-to-br from-yellow-100 to-amber-100 rounded-2xl flex items-center justify-center">
                          <Wheat className="w-6 h-6 text-yellow-700" strokeWidth={1.5} />
                        </div>
                        <span className="text-[11px] font-bold text-gray-700 text-center leading-tight">
                          Kuruyemiş
                        </span>
                      </Link>
                    </div>
                  </div>

                  {/* Auth Buttons - Guest only */}
                  {!user && (
                    <div className="px-6 pb-6">
                      <div className="flex gap-3">
                        <Link 
                          href="/giris" 
                          onClick={() => setIsMenuOpen(false)}
                          className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-center"
                        >
                          Giriş Yap
                        </Link>
                        <Link 
                          href="/kayit" 
                          onClick={() => setIsMenuOpen(false)}
                          className="flex-1 py-3 border-2 border-primary text-primary rounded-xl font-bold text-center"
                        >
                          Kayıt Ol
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* Footer Section */}
                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-6">
                    <div className="space-y-3 mb-6">
                      <Link
                        href="/sss"
                        onClick={() => setIsMenuOpen(false)}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-white transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <HelpCircle className="w-5 h-5 text-gray-500" />
                          <span className="text-sm font-medium text-gray-700">Sıkça Sorulan Sorular</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </Link>
                      
                      <a
                        href={`tel:${CONTACT_INFO.phone}`}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-white transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Phone className="w-5 h-5 text-gray-500" />
                          <div>
                            <span className="text-sm font-medium text-gray-700">Müşteri Hizmetleri</span>
                            <p className="text-xs text-gray-500">{CONTACT_INFO.phone}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </a>
                    </div>

                    {/* Social Links */}
                    <div className="flex items-center justify-center gap-4 py-4 border-t border-gray-200">
                      <a href={SOCIAL_LINKS.instagram} target="_blank" className="w-10 h-10 bg-gray-200 hover:bg-[#E4405F] hover:text-white rounded-full flex items-center justify-center transition-all">
                        <Instagram className="w-5 h-5" />
                      </a>
                      <a href={SOCIAL_LINKS.facebook} target="_blank" className="w-10 h-10 bg-gray-200 hover:bg-[#1877F2] hover:text-white rounded-full flex items-center justify-center transition-all">
                        <Facebook className="w-5 h-5" />
                      </a>
                    </div>

                    {/* Logout Button */}
                    {user && (
                      <button
                        onClick={handleLogout}
                        className="w-full mt-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Çıkış Yap
                      </button>
                    )}

                    <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-4">
                      © {new Date().getFullYear()} {STORE_RUNTIME.name}
                    </p>
                  </div>

                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </header>
  );
}
