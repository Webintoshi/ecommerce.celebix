"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ElementType, type TouchEvent as ReactTouchEvent } from "react";
import {
  Archive,
  BarChart3,
  Calculator,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe2,
  Image as ImageIcon,
  Languages,
  LayoutDashboard,
  Layers3,
  LogOut,
  Megaphone as MarketingIcon,
  Package,
  Percent,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  TicketPercent,
  Truck,
  Users,
  Users as AdminsIcon,
  WalletCards,
  X,
} from "lucide-react";
import type { InitialAdminProfile } from "@/lib/admin-data-types";
import { hasActionPermission, hasPermission, type AdminPermission, type UserRole } from "@/lib/permissions";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { useStoreInfo } from "@/lib/store-info-context";
import { cn } from "@/lib/utils";

const ADMIN_BRAND_LOGO_SRC = "/branding/celebix-x.svg";
const MOBILE_QUICK_ACCESS_TITLES = ["Dashboard", "Siparişler", "Ürünler", "Müşteriler", "Genel Ayarlar"] as const;

type MenuSubItem = {
  title: string;
  href: string;
};

interface MenuItem {
  title: string;
  icon: ElementType;
  href?: string;
  externalHref?: string;
  badge?: number | string;
  status?: "soon";
  disabled?: boolean;
  permissionHref?: string;
  permission?: AdminPermission;
  submenu?: MenuSubItem[];
}

type MenuGroup = {
  id: string;
  label: string;
  titles: string[];
};

const MENU_ITEMS: MenuItem[] = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/admin" },
  {
    title: "Siparişler",
    icon: ShoppingBag,
    href: "/admin/siparisler",
    submenu: [
      { title: "Tüm Siparişler", href: "/admin/siparisler" },
      { title: "Hızlı Sipariş", href: "/admin/siparisler/hizli-siparis" },
    ],
  },
  { title: "Terk Sepetler", icon: Archive, href: "/admin/siparisler/sepet-terk", permissionHref: "/admin/siparisler" },
  {
    title: "Müşteriler",
    icon: Users,
    href: "/admin/musteriler",
    submenu: [
      { title: "Tüm Müşteriler", href: "/admin/musteriler" },
      { title: "Segmentler", href: "/admin/musteriler/segmentler" },
      { title: "Yeni Müşteri", href: "/admin/musteriler/yeni" },
    ],
  },
  {
    title: "Ürünler",
    icon: Package,
    href: "/admin/urunler",
    submenu: [
      { title: "Ürün Yönetimi", href: "/admin/urunler" },
      { title: "Koleksiyon Yönetimi", href: "/admin/urunler/koleksiyonlar" },
      { title: "Marka Yönetimi", href: "/admin/urunler/markalar" },
      { title: "Nitelikler", href: "/admin/urunler/nitelikler" },
      { title: "Ürün Yorumları", href: "/admin/urunler/yorumlar" },
      { title: "Ekstralar", href: "/admin/urunler/ekstralar" },
      { title: "Toplu Yükle (CSV)", href: "/admin/urunler/toplu-yukle" },
    ],
  },
  { title: "Kategoriler", icon: Layers3, permissionHref: "/admin/kategoriler", disabled: true, status: "soon" },
  { title: "Medya", icon: ImageIcon, permissionHref: "/admin/medya", disabled: true, status: "soon" },
  {
    title: "İndirimler",
    icon: Percent,
    href: "/admin/indirimler",
    submenu: [
      { title: "Tüm İndirimler", href: "/admin/indirimler" },
      { title: "Yeni İndirim", href: "/admin/indirimler/yeni" },
      { title: "Şans Çarkı", href: "/admin/indirimler/sans-carki" },
    ],
  },
  { title: "Kuponlar", icon: TicketPercent, permissionHref: "/admin/kuponlar", disabled: true, status: "soon" },
  {
    title: "Kampanyalar",
    icon: MarketingIcon,
    href: "/admin/pazarlama",
    submenu: [
      { title: "Kampanya Merkezi", href: "/admin/pazarlama" },
      { title: "E-posta", href: "/admin/pazarlama/email" },
      { title: "SMS", href: "/admin/pazarlama/phone" },
      { title: "WhatsApp", href: "/admin/pazarlama/whatsapp" },
    ],
  },
  { title: "Mağaza Görünümü", icon: Globe2, externalHref: STORE_RUNTIME.storefrontUrl },
  {
    title: "Sayfalar / Blog",
    icon: FileText,
    href: "/admin/cms",
    submenu: [
      { title: "Blog Yazıları", href: "/admin/cms/blog" },
      { title: "Sayfalar", href: "/admin/cms/sayfalar" },
      { title: "Politikalar", href: "/admin/cms/politikalar" },
    ],
  },
  { title: "Dil Ayarları", icon: Languages, href: "/admin/ayarlar/dil", permissionHref: "/admin/ayarlar" },
  { title: "Ödeme", icon: WalletCards, href: "/admin/ayarlar/odeme", permissionHref: "/admin/ayarlar" },
  { title: "Kargo", icon: Truck, href: "/admin/ayarlar/kargo", permissionHref: "/admin/ayarlar" },
  { title: "Entegrasyonlar", icon: Store, href: "/admin/markets" },
  { title: "Yöneticiler", icon: AdminsIcon, href: "/admin/yoneticiler" },
  { title: "Genel Ayarlar", icon: Settings, href: "/admin/ayarlar" },
  { title: "Analizler", icon: BarChart3, href: "/admin/analizler" },
  {
    title: "Muhasebe",
    icon: Calculator,
    href: "/admin/muhasebe",
    permission: "accounting.view",
    submenu: [
      { title: "Genel Bakış", href: "/admin/muhasebe" },
      { title: "Fatura Entegrasyonu", href: "/admin/muhasebe/fatura-entegrasyonu" },
    ],
  },
  {
    title: "SEO Araçları",
    icon: Search,
    href: "/admin/seo-killer",
    submenu: [
      { title: "SEO Kontrol", href: "/admin/seo-killer" },
      { title: "Sitemap", href: "/admin/seo-killer/sitemap" },
      { title: "Sosyal Önizleme", href: "/admin/seo-killer/sosyal-onizleme" },
      { title: "Kod Entegrasyonları", href: "/admin/seo-killer/kod-entegrasyonlari" },
      { title: "Hızlı İndeks", href: "/admin/seo-killer/hizli-index" },
    ],
  },
];

const MENU_GROUPS: MenuGroup[] = [
  { id: "home", label: "Ana", titles: ["Dashboard"] },
  { id: "operations", label: "Operasyon", titles: ["Siparişler", "Terk Sepetler", "Müşteriler"] },
  { id: "catalog", label: "Katalog", titles: ["Ürünler", "Kategoriler", "Medya"] },
  { id: "marketing", label: "Pazarlama", titles: ["İndirimler", "Kuponlar", "Kampanyalar"] },
  { id: "store", label: "Mağaza", titles: ["Mağaza Görünümü", "Sayfalar / Blog", "Dil Ayarları"] },
  { id: "settings", label: "Ayarlar", titles: ["Ödeme", "Kargo", "Entegrasyonlar", "Yöneticiler", "Genel Ayarlar"] },
  { id: "advanced", label: "Gelişmiş", titles: ["Analizler", "Muhasebe", "SEO Araçları"] },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialProfile?: InitialAdminProfile | null;
}

type AdminMeResponse =
  | {
      success: true;
      profile: {
        email: string;
        full_name: string | null;
        role: UserRole;
      };
    }
  | {
      success: false;
      error?: string;
    };

type MenuItemState = {
  hasSubmenu: boolean;
  isDirectActive: boolean;
  isParentActive: boolean;
  isSubmenuActive: boolean;
  isExpanded: boolean;
  isActive: boolean;
};

function pathMatches(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

function deriveAdminName(profile: InitialAdminProfile | null) {
  const explicitName = profile?.fullName?.trim();

  if (explicitName) {
    return explicitName;
  }

  const emailPrefix = profile?.email?.split("@")[0]?.trim();

  if (!emailPrefix) {
    return "Admin Kullanıcı";
  }

  const normalized = emailPrefix
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0
    ? normalized.replace(/\b\w/g, (char) => char.toLocaleUpperCase("tr"))
    : "Admin Kullanıcı";
}

export function AdminSidebar({
  isOpen = true,
  onClose,
  initialProfile = null,
}: SidebarProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { storeInfo } = useStoreInfo();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [resolvedProfile, setResolvedProfile] = useState<InitialAdminProfile | null>(initialProfile);
  const [isRecoveringProfile, setIsRecoveringProfile] = useState(false);
  const [hasAttemptedProfileRecovery, setHasAttemptedProfileRecovery] = useState(Boolean(initialProfile?.role));
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchCurrentXRef = useRef<number | null>(null);
  const touchCurrentYRef = useRef<number | null>(null);

  const role: UserRole | null = resolvedProfile?.role || null;
  const adminFullName = deriveAdminName(resolvedProfile);
  const siteName = (storeInfo?.name || STORE_RUNTIME.name).trim();
  const siteHeading = /admin/i.test(siteName) ? siteName : `${siteName} Admin`;
  const siteLogo = storeInfo?.logoUrl || ADMIN_BRAND_LOGO_SRC;
  const mobileMenuOpen = isMobile ? isOpen : true;
  const isLogtoProvider = process.env.NEXT_PUBLIC_ADMIN_AUTH_PROVIDER === "logto";
  const logtoLogoutHref = "/api/auth/logout?next=%2Fadmin%2Flogin%3Flogged_out%3D1";

  useEffect(() => {
    setResolvedProfile(initialProfile);
    setIsRecoveringProfile(false);
    setHasAttemptedProfileRecovery(Boolean(initialProfile?.role));
  }, [initialProfile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncMobileState = () => setIsMobile(mediaQuery.matches);
    syncMobileState();
    mediaQuery.addEventListener("change", syncMobileState);
    return () => mediaQuery.removeEventListener("change", syncMobileState);
  }, []);

  useEffect(() => {
    const autoExpand = MENU_ITEMS.filter(
      (item) =>
        item.submenu &&
        item.href &&
        (pathMatches(pathname, item.href) || item.submenu.some((sub) => pathMatches(pathname, sub.href))),
    ).map((item) => item.title);

    if (autoExpand.length === 0) {
      return;
    }

    setExpandedMenus((prev) => Array.from(new Set([...prev, ...autoExpand])));
  }, [pathname]);

  useEffect(() => {
    if (role || hasAttemptedProfileRecovery) {
      return;
    }

    let active = true;
    setHasAttemptedProfileRecovery(true);
    setIsRecoveringProfile(true);

    fetch("/api/admin/me", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as AdminMeResponse | null;

        if (!active || !response.ok || !payload?.success || !payload.profile?.role) {
          return;
        }

        setResolvedProfile({
          email: payload.profile.email,
          fullName: payload.profile.full_name,
          role: payload.profile.role,
        });
      })
      .catch((error) => {
        if (active) {
          console.warn("Admin profile recovery failed:", error);
        }
      })
      .finally(() => {
        if (active) {
          setIsRecoveringProfile(false);
        }
      });

    return () => {
      active = false;
    };
  }, [hasAttemptedProfileRecovery, role]);

  const filteredItems = useMemo(() => {
    if (!role) {
      return [];
    }

    return MENU_ITEMS.filter((item) => {
      if (item.externalHref) {
        return true;
      }

      const permissionPath = item.permissionHref ?? item.href;

      if (!permissionPath || !hasPermission(role, permissionPath)) {
        return false;
      }

      if (item.permission && !hasActionPermission(role, item.permission)) {
        return false;
      }

      return true;
    });
  }, [role]);

  const groupedItems = useMemo(() => {
    const byTitle = new Map(filteredItems.map((item) => [item.title, item]));
    const usedTitles = new Set<string>();

    const groups = MENU_GROUPS.map((group) => {
      const items = group.titles
        .map((title) => byTitle.get(title))
        .filter((item): item is MenuItem => Boolean(item));

      items.forEach((item) => usedTitles.add(item.title));

      return {
        ...group,
        items,
      };
    }).filter((group) => group.items.length > 0);

    const remainingItems = filteredItems.filter((item) => !usedTitles.has(item.title));

    if (remainingItems.length > 0) {
      groups.push({
        id: "other",
        label: "Diğer",
        titles: remainingItems.map((item) => item.title),
        items: remainingItems,
      });
    }

    return groups;
  }, [filteredItems]);

  const quickAccessItems = useMemo(() => {
    const itemsByTitle = new Map(filteredItems.map((item) => [item.title, item]));

    return MOBILE_QUICK_ACCESS_TITLES.map((title) => itemsByTitle.get(title)).filter(
      (item): item is MenuItem => Boolean(item),
    );
  }, [filteredItems]);

  const getItemState = (item: MenuItem): MenuItemState => {
    const hasSubmenu = Boolean(item.submenu?.length);
    const itemHref = item.disabled || item.externalHref ? "" : item.href ?? "";
    const isDirectActive = Boolean(itemHref) && pathMatches(pathname, itemHref) && !hasSubmenu;
    const isParentActive = Boolean(itemHref) && hasSubmenu && pathMatches(pathname, itemHref);
    const isSubmenuActive = item.submenu?.some((sub) => pathMatches(pathname, sub.href)) ?? false;
    const isExpanded = expandedMenus.includes(item.title);
    const isActive = isDirectActive || isParentActive || isSubmenuActive;

    return {
      hasSubmenu,
      isDirectActive,
      isParentActive,
      isSubmenuActive,
      isExpanded,
      isActive,
    };
  };

  useEffect(() => {
    if (!isMobile || !mobileMenuOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMobile, mobileMenuOpen, onClose]);

  const toggleMenu = (title: string) => {
    setExpandedMenus((prev) => {
      const expanded = prev.includes(title);

      if (isMobile) {
        return expanded ? [] : [title];
      }

      return expanded ? prev.filter((item) => item !== title) : [...prev, title];
    });
  };

  const handleLogout = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    if (isLogtoProvider) {
      if (typeof window !== "undefined") {
        window.location.assign("/api/auth/logout");
      } else {
        router.replace("/admin/login");
        router.refresh();
      }
      return;
    }

    try {
      const supabase = getBrowserSupabaseClient();
      await Promise.allSettled([
        supabase.auth.signOut(),
        fetch("/api/admin/logout", {
          method: "POST",
          cache: "no-store",
        }),
      ]);
    } finally {
      if (typeof window !== "undefined") {
        window.location.assign("/admin/login");
      } else {
        router.replace("/admin/login");
        router.refresh();
      }
    }
  };

  const handleLeafClick = () => {
    if (isMobile && onClose) {
      onClose();
    }
  };

  const resetTouchTracking = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchCurrentXRef.current = null;
    touchCurrentYRef.current = null;
  };

  const handleDrawerTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchCurrentXRef.current = touch.clientX;
    touchCurrentYRef.current = touch.clientY;
  };

  const handleDrawerTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    touchCurrentXRef.current = touch.clientX;
    touchCurrentYRef.current = touch.clientY;
  };

  const handleDrawerTouchEnd = () => {
    if (!mobileMenuOpen || !onClose || touchStartXRef.current === null || touchStartYRef.current === null) {
      resetTouchTracking();
      return;
    }

    const deltaX = (touchCurrentXRef.current ?? touchStartXRef.current) - touchStartXRef.current;
    const deltaY = Math.abs((touchCurrentYRef.current ?? touchStartYRef.current) - touchStartYRef.current);

    if (deltaX > 72 && deltaY < 56) {
      onClose();
    }

    resetTouchTracking();
  };

  const desktopAsideClassName =
    "sticky top-0 z-20 flex h-screen w-[16rem] shrink-0 flex-col bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFD_100%)] shadow-[10px_0_32px_rgba(17,24,39,0.045)] xl:w-[16.25rem] 2xl:w-[16.5rem]";

  if (isMobile) {
    return (
      <>
        <div
          className={cn(
            "fixed inset-0 z-[68] bg-[rgba(17,24,39,0.34)] backdrop-blur-[3px] transition-opacity duration-200 md:hidden",
            mobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={!mobileMenuOpen}
        >
          <button
            type="button"
            aria-label="Menüyü kapat"
            className="absolute inset-0"
            onClick={onClose}
            tabIndex={mobileMenuOpen ? 0 : -1}
          />
        </div>

        <aside
          id="admin-mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Mobil yönetim menüsü"
          aria-hidden={!mobileMenuOpen}
          className={cn(
            "fixed inset-y-0 right-0 z-[74] w-[min(91vw,24.75rem)] max-w-[24.75rem] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden",
            mobileMenuOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
          )}
          onTouchStart={handleDrawerTouchStart}
          onTouchMove={handleDrawerTouchMove}
          onTouchEnd={handleDrawerTouchEnd}
          onTouchCancel={resetTouchTracking}
        >
          <div className="flex h-full flex-col overflow-hidden rounded-l-[24px] border-l border-[var(--admin-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.99)_0%,rgba(247,248,250,0.99)_100%)] shadow-[-22px_0_48px_rgba(17,24,39,0.16)]">
            <div className="border-b border-[#EEF1F4] px-4 pb-4 pt-[max(env(safe-area-inset-top,0px),1rem)]">
              <div className="flex justify-center">
                <span className="h-1.5 w-14 rounded-full bg-[#D8DDE5]" />
              </div>

              <div className="mt-4 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[1.15rem] border border-[#E7EAF0] bg-[#F7F8FA] shadow-[0_10px_24px_rgba(17,24,39,0.05)]">
                  <Image
                    src={siteLogo}
                    alt={siteName}
                    width={48}
                    height={48}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="truncate text-[17px] font-semibold tracking-[-0.03em] text-[#1F2937]">{siteName}</p>
                  <p className="mt-1 truncate text-[14px] text-[#6B7280]">{adminFullName}</p>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-[#E7EAF0] bg-white text-[#6B7280] shadow-[0_12px_26px_rgba(17,24,39,0.06)] transition-colors active:scale-[0.98]"
                  aria-label="Menüyü kapat"
                >
                  <X className="h-[1.1rem] w-[1.1rem]" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4 pt-4">
              {!role && !isRecoveringProfile ? (
                <div className="rounded-[1.15rem] border border-[#E7EAF0] bg-[#F7F8FA] px-3.5 py-3 text-[13px] font-medium text-[#6B7280]">
                  Yetki bilgisi yüklenemedi.
                </div>
              ) : null}

              {quickAccessItems.length > 0 ? (
                <section className={cn("space-y-3.5", !role && !isRecoveringProfile ? "mt-4" : "")}>
                  <div className="px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
                      Hızlı Erişim
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {quickAccessItems.map((item, index) => {
                      const { isActive } = getItemState(item);
                      const isWideCard = quickAccessItems.length % 2 === 1 && index === quickAccessItems.length - 1;

                      return (
                        <Link
                          key={item.title}
                          href={item.href ?? item.externalHref ?? "#"}
                          target={item.externalHref ? "_blank" : undefined}
                          rel={item.externalHref ? "noreferrer" : undefined}
                          aria-current={isActive ? "page" : undefined}
                          onClick={handleLeafClick}
                          className={cn(
                            "group flex min-h-[78px] items-center gap-3 rounded-[1.35rem] border px-3.5 py-3.5 transition-all duration-200 active:scale-[0.99]",
                            isWideCard ? "col-span-2" : "",
                            isActive
                              ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]"
                              : "border-[#E7EAF0] bg-white text-[#374151]",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border transition-colors",
                              isActive
                                ? "border-[#FFD7BF] bg-white text-[#FF6A00]"
                                : "border-[#EEF1F4] bg-[#F7F8FA] text-[#6B7280]",
                            )}
                          >
                            <item.icon className="h-[1.1rem] w-[1.1rem]" />
                          </span>
                          <span className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.01em]">
                            {item.title}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className={cn("space-y-3.5", quickAccessItems.length > 0 || (!role && !isRecoveringProfile) ? "mt-5" : "")}>
                <div className="px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
                    Tüm Alanlar
                  </p>
                </div>

                <div className="overflow-hidden rounded-[1.4rem] border border-[#E7EAF0] bg-white">
                  {filteredItems.map((item, index) => {
                    const { hasSubmenu, isExpanded, isActive } = getItemState(item);
                    const rowId = `admin-mobile-drawer-section-${index}`;
                    const statusLabel = item.status === "soon" ? "Yakında" : item.badge;

                    const rowClasses = cn(
                      "group relative flex min-h-[58px] w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-200 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(255,106,0,0.16)]",
                      isActive ? "bg-[#FFF1E8] text-[#E85D04]" : "bg-white text-[#374151]",
                      item.disabled ? "cursor-not-allowed text-[#9CA3AF] active:scale-100" : "",
                    );

                    const content = (
                      <>
                        <span
                          className={cn(
                            "pointer-events-none absolute bottom-3 left-0 top-3 w-[3px] rounded-full bg-[#FF6A00] transition-opacity duration-200",
                            isActive ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] transition-colors",
                            isActive ? "bg-white text-[#FF6A00]" : "bg-[#F7F8FA] text-[#6B7280]",
                          )}
                        >
                          <item.icon className="h-[1.05rem] w-[1.05rem]" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.01em]">
                          {item.title}
                        </span>
                        {statusLabel ? (
                          <span className="rounded-full border border-[#E7EAF0] bg-[#F7F8FA] px-2 py-0.5 text-[11px] font-medium text-[#6B7280]">
                            {statusLabel}
                          </span>
                        ) : null}
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 shrink-0 text-[#9CA3AF] transition-transform duration-200",
                            hasSubmenu && isExpanded ? "rotate-90 text-[#FF6A00]" : "",
                            !hasSubmenu && isActive ? "text-[#FF6A00]" : "",
                          )}
                        />
                      </>
                    );

                    return (
                      <div key={item.title} className={cn(index > 0 ? "border-t border-[#EEF1F4]" : "")}>
                        {item.disabled ? (
                          <button
                            type="button"
                            disabled
                            aria-disabled="true"
                            className={rowClasses}
                          >
                            {content}
                          </button>
                        ) : hasSubmenu ? (
                          <button
                            type="button"
                            onClick={() => toggleMenu(item.title)}
                            aria-expanded={isExpanded}
                            aria-controls={rowId}
                            className={rowClasses}
                          >
                            {content}
                          </button>
                        ) : (
                          item.externalHref ? (
                            <a
                              href={item.externalHref}
                              target="_blank"
                              rel="noreferrer"
                              onClick={handleLeafClick}
                              className={rowClasses}
                            >
                              {content}
                            </a>
                          ) : (
                            <Link
                              href={item.href ?? "#"}
                              aria-current={isActive ? "page" : undefined}
                              onClick={handleLeafClick}
                              className={rowClasses}
                            >
                              {content}
                            </Link>
                          )
                        )}

                        {hasSubmenu ? (
                          <div
                            id={rowId}
                            className={cn(
                              "grid overflow-hidden transition-all duration-200 ease-out",
                              isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                            )}
                          >
                            <div className="min-h-0">
                              <div className="pb-3 pl-[3.95rem] pr-3.5">
                                <div className="space-y-1 border-l border-[#EEF1F4] pl-3">
                                  {item.submenu?.map((sub) => {
                                    const isSubActive = pathMatches(pathname, sub.href);

                                    return (
                                      <Link
                                        key={sub.href}
                                        href={sub.href}
                                        aria-current={isSubActive ? "page" : undefined}
                                        onClick={handleLeafClick}
                                        className={cn(
                                          "flex min-h-[40px] items-center gap-2 rounded-[0.95rem] px-3 py-2 text-[13px] transition-colors duration-200 active:scale-[0.995]",
                                          isSubActive
                                            ? "bg-[#FFF1E8] text-[#E85D04]"
                                            : "text-[#6B7280] hover:bg-[#F7F8FA] hover:text-[#374151]",
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "h-1.5 w-1.5 shrink-0 rounded-full",
                                            isSubActive ? "bg-[#FF6A00]" : "bg-[#D1D5DB]",
                                          )}
                                        />
                                        <span className="truncate">{sub.title}</span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="border-t border-[#EEF1F4] bg-white/96 px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)] pt-3.5">
              <div className="space-y-1.5">
                {isLogtoProvider ? (
                  <a
                    href={logtoLogoutHref}
                    className="flex min-h-[48px] w-full items-center gap-3 rounded-[1rem] px-3.5 text-[14px] font-medium text-[#6B7280] transition-colors duration-200 active:scale-[0.99] hover:bg-[#FDECEC] hover:text-[#EF4444]"
                  >
                    <LogOut className="h-[1rem] w-[1rem] shrink-0" />
                    <span>Çıkış Yap</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isSigningOut}
                    className="flex min-h-[48px] w-full items-center gap-3 rounded-[1rem] px-3.5 text-[14px] font-medium text-[#6B7280] transition-colors duration-200 active:scale-[0.99] hover:bg-[#FDECEC] hover:text-[#EF4444]"
                  >
                    <LogOut className="h-[1rem] w-[1rem] shrink-0" />
                    <span>{isSigningOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}</span>
                  </button>
                )}

                <Link
                  href={STORE_RUNTIME.storefrontUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[48px] items-center gap-3 rounded-[1rem] px-3.5 text-[14px] font-medium text-[#6B7280] transition-colors duration-200 active:scale-[0.99] hover:bg-[#F7F8FA] hover:text-[#1F2937]"
                >
                  <Store className="h-[1rem] w-[1rem] shrink-0" />
                  <span>Siteye Dön</span>
                </Link>
              </div>
            </div>
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside className={cn("border-r border-[var(--admin-border)]", desktopAsideClassName)}>
      <div className="border-b border-[var(--admin-border)] px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[1.05rem] border border-[var(--admin-border)] bg-[var(--admin-bg)] shadow-[0_10px_24px_rgba(17,24,39,0.05)]">
            <Image
              src={siteLogo}
              alt={siteName}
              width={40}
              height={40}
              className="h-full w-full object-cover"
              unoptimized
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">
              {siteHeading}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-[var(--admin-text-secondary)]">
              {adminFullName}
            </p>
          </div>
        </div>
      </div>

      {!role && !isRecoveringProfile ? (
        <div className="mx-3.5 mt-3 rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-bg)] px-3 py-2.5 text-[13px] font-medium text-[var(--admin-text-secondary)]">
          Yetki bilgisi yüklenemedi.
        </div>
      ) : null}

      <nav className="flex-1 space-y-4 overflow-y-auto px-3.5 py-4">
        {groupedItems.map((group) => (
          <section key={group.id} className="space-y-1.5">
            <div className="px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-text-secondary)]">
                {group.label}
              </p>
            </div>

            <div className="space-y-1">
              {group.items.map((item) => {
                const { hasSubmenu, isExpanded, isActive } = getItemState(item);
                const statusLabel = item.status === "soon" ? "Yakında" : item.badge;

                const rowClasses = cn(
                  "group relative flex min-h-[44px] w-full items-center gap-2.5 rounded-[1rem] border border-transparent px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(255,106,0,0.14)]",
                  isActive
                    ? "bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]"
                    : "text-[var(--admin-text)] hover:bg-[var(--admin-bg)] hover:text-[var(--admin-heading)]",
                  item.disabled ? "cursor-not-allowed opacity-70 hover:bg-transparent hover:text-[var(--admin-text)]" : "",
                );

                const iconShellClasses = cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] border transition-colors",
                  isActive
                    ? "border-[var(--admin-accent-border)] bg-white text-[var(--admin-accent-hover)]"
                    : "border-[#EEF1F4] bg-[var(--admin-bg)] text-[var(--admin-text-secondary)] group-hover:border-[var(--admin-accent-border)] group-hover:text-[var(--admin-accent-hover)]",
                );

                const content = (
                  <>
                    <span
                      className={cn(
                        "pointer-events-none absolute bottom-2 left-0 top-2 w-[2px] rounded-full bg-[var(--admin-accent)] transition-opacity",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className={iconShellClasses}>
                      <item.icon className="h-[1rem] w-[1rem]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{item.title}</span>
                    {statusLabel ? (
                      <span className="rounded-full border border-[var(--admin-border)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--admin-text-secondary)]">
                        {statusLabel}
                      </span>
                    ) : null}
                    {hasSubmenu ? (
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-[var(--admin-text-muted)] transition-transform duration-200 group-hover:text-[var(--admin-accent-hover)]",
                          isExpanded ? "rotate-180" : "rotate-0",
                        )}
                      />
                    ) : null}
                  </>
                );

                return (
                  <div key={item.title} className="space-y-1">
                    {item.disabled ? (
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className={rowClasses}
                      >
                        {content}
                      </button>
                    ) : hasSubmenu ? (
                      <button
                        type="button"
                        onClick={() => toggleMenu(item.title)}
                        aria-expanded={isExpanded}
                        aria-controls={`sidebar-group-${group.id}-${item.title}`}
                        className={rowClasses}
                      >
                        {content}
                      </button>
                    ) : (
                      item.externalHref ? (
                        <a
                          href={item.externalHref}
                          target="_blank"
                          rel="noreferrer"
                          onClick={handleLeafClick}
                          className={rowClasses}
                        >
                          {content}
                        </a>
                      ) : (
                        <Link
                          href={item.href ?? "#"}
                          aria-current={isActive ? "page" : undefined}
                          onClick={handleLeafClick}
                          className={rowClasses}
                        >
                          {content}
                        </Link>
                      )
                    )}

                    {hasSubmenu ? (
                      <div
                        id={`sidebar-group-${group.id}-${item.title}`}
                        className={cn(
                          "grid overflow-hidden transition-all duration-200 ease-out",
                          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <div className="min-h-0">
                          <div className="ml-5 border-l border-[var(--admin-border)] pl-3 pt-0.5">
                            <div className="space-y-1">
                              {item.submenu?.map((sub) => {
                                const isSubActive = pathMatches(pathname, sub.href);

                                return (
                                  <Link
                                    key={sub.href}
                                    href={sub.href}
                                    aria-current={isSubActive ? "page" : undefined}
                                    onClick={handleLeafClick}
                                    className={cn(
                                      "group flex min-h-[38px] items-center gap-2 rounded-[0.85rem] px-3 py-2 text-[13px] transition-colors",
                                      isSubActive
                                        ? "bg-white text-[var(--admin-accent-hover)] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
                                        : "text-[var(--admin-text-secondary)] hover:bg-[var(--admin-bg)] hover:text-[var(--admin-heading)]",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                                        isSubActive
                                          ? "bg-[var(--admin-accent)]"
                                          : "bg-[#D1D5DB] group-hover:bg-[var(--admin-accent-border)]",
                                      )}
                                    />
                                    <span className="truncate">{sub.title}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="space-y-1.5 border-t border-[var(--admin-border)] bg-white/72 px-3 py-3.5">
        {isLogtoProvider ? (
          <a
            href={logtoLogoutHref}
            className="flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-[14px] font-medium text-[var(--admin-text-secondary)] transition-colors hover:bg-[var(--admin-danger-soft)] hover:text-[var(--admin-danger)]"
          >
            <LogOut className="h-[1rem] w-[1rem] shrink-0" />
            <span>Çıkış Yap</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isSigningOut}
            className="flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-[14px] font-medium text-[var(--admin-text-secondary)] transition-colors hover:bg-[var(--admin-danger-soft)] hover:text-[var(--admin-danger)]"
          >
            <LogOut className="h-[1rem] w-[1rem] shrink-0" />
            <span>{isSigningOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}</span>
          </button>
        )}

        <Link
          href={STORE_RUNTIME.storefrontUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-[1rem] px-3 py-2.5 text-[14px] font-medium text-[var(--admin-text-secondary)] transition-colors hover:bg-[var(--admin-bg)] hover:text-[var(--admin-heading)]"
        >
          <Store className="h-[1rem] w-[1rem] shrink-0" />
          <span>Siteye Dön</span>
        </Link>
      </div>
    </aside>
  );
}
