"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ElementType, type TouchEvent as ReactTouchEvent } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  Home,
  LogOut,
  Megaphone as MarketingIcon,
  Package,
  Percent,
  Search,
  Settings,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import type { InitialAdminProfile } from "@/lib/admin-data-types";
import {
  getRoleLabel,
  hasActionPermission,
  hasPermission,
  type AdminPermission,
  type UserRole,
} from "@/lib/permissions";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { useStoreInfo } from "@/lib/store-info-context";
import { cn } from "@/lib/utils";

const ADMIN_BRAND_LOGO_SRC = "/Logo/celebix-beyaz-logo.svg";

type MenuSubItem = {
  title: string;
  href: string;
  group?: string;
  badge?: string;
};

interface MenuItem {
  title: string;
  icon: ElementType;
  href?: string;
  externalHref?: string;
  badge?: number | string;
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
  { title: "Giriş", icon: Home, href: "/admin" },
  {
    title: "Siparişler",
    icon: ShoppingBag,
    href: "/admin/siparisler",
    submenu: [
      { title: "Tüm Siparişler", href: "/admin/siparisler" },
      { title: "Hızlı Sipariş", href: "/admin/siparisler/hizli-siparis" },
      { title: "Terk Sepetler", href: "/admin/siparisler/sepet-terk" },
    ],
  },
  {
    title: "Müşteriler",
    icon: Users,
    href: "/admin/musteriler",
    submenu: [
      { title: "Tüm Müşteriler", href: "/admin/musteriler" },
      { title: "Segmentler", href: "/admin/musteriler/segmentler" },
      { title: "Etiketler", href: "/admin/musteriler/etiketler" },
      { title: "Yeni Müşteri", href: "/admin/musteriler/yeni" },
    ],
  },
  {
    title: "Ürünler",
    icon: Package,
    href: "/admin/urunler",
    submenu: [
      { title: "Tüm Ürünler", href: "/admin/urunler" },
      { title: "Yeni Ürün", href: "/admin/urunler/yeni" },
      { title: "Koleksiyonlar", href: "/admin/urunler/koleksiyonlar" },
      { title: "Markalar", href: "/admin/urunler/markalar" },
      { title: "Nitelikler", href: "/admin/urunler/nitelikler" },
      { title: "Ekstralar", href: "/admin/urunler/ekstralar" },
      { title: "Yorumlar", href: "/admin/urunler/yorumlar" },
      { title: "Tanımlamalar", href: "/admin/urunler/tanimlamalar" },
      { title: "Toplu Yükle", href: "/admin/urunler/toplu-yukle" },
    ],
  },
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
  {
    title: "Pazarlama",
    icon: MarketingIcon,
    href: "/admin/pazarlama",
    submenu: [
      { title: "Genel Bakış", href: "/admin/pazarlama" },
      { title: "E-posta", href: "/admin/pazarlama/email" },
      { title: "Telefon", href: "/admin/pazarlama/phone" },
      { title: "WhatsApp", href: "/admin/pazarlama/whatsapp" },
      { title: "Blog Yazıları", href: "/admin/cms/blog", group: "İçerik" },
      { title: "Sayfalar", href: "/admin/cms/sayfalar", group: "İçerik" },
      { title: "Politikalar", href: "/admin/cms/politikalar", group: "İçerik" },
    ],
  },
  {
    title: "Ayarlar",
    icon: Settings,
    href: "/admin/ayarlar",
    submenu: [
      { title: "Genel", href: "/admin/ayarlar" },
      { title: "Dil", href: "/admin/ayarlar/dil" },
      { title: "Ödeme", href: "/admin/ayarlar/odeme" },
      { title: "Kargo", href: "/admin/ayarlar/kargo" },
      { title: "Entegrasyonlar", href: "/admin/markets" },
      { title: "Yöneticiler", href: "/admin/yoneticiler" },
    ],
  },
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
  { id: "home", label: "Ana", titles: ["Giriş"] },
  { id: "operations", label: "Operasyon", titles: ["Siparişler", "Müşteriler", "Ürünler"] },
  { id: "marketing", label: "Pazarlama", titles: ["İndirimler", "Pazarlama"] },
  { id: "settings", label: "Ayarlar", titles: ["Ayarlar"] },
  { id: "advanced", label: "Gelişmiş", titles: ["Muhasebe", "SEO Araçları"] },
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

function submenuPathMatches(pathname: string, href: string, parentHref?: string) {
  if (href === parentHref) {
    return pathname === href;
  }

  return pathMatches(pathname, href);
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

function deriveAdminInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);

  return (parts.length > 0 ? parts : ["A"])
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr"))
    .join("");
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
  const adminInitials = deriveAdminInitials(adminFullName);
  const adminRoleLabel = role ? getRoleLabel(role) : "Admin";
  const siteName = (storeInfo?.name || STORE_RUNTIME.name).trim();
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

    const mediaQuery = window.matchMedia("(max-width: 1024px)");
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

  const getItemState = (item: MenuItem): MenuItemState => {
    const hasSubmenu = Boolean(item.submenu?.length);
    const itemHref = item.externalHref ? "" : item.href ?? "";
    const isDirectActive = Boolean(itemHref) && pathMatches(pathname, itemHref) && !hasSubmenu;
    const isParentActive = Boolean(itemHref) && hasSubmenu && pathMatches(pathname, itemHref);
    const isSubmenuActive = item.submenu?.some((sub) => submenuPathMatches(pathname, sub.href, item.href)) ?? false;
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
    "sticky top-0 z-20 flex h-screen w-[15rem] shrink-0 flex-col bg-[#2A2A2A] text-white shadow-[12px_0_34px_rgba(0,0,0,0.18)] xl:w-[15.5rem] 2xl:w-[16rem]";

  if (isMobile) {
    return (
      <>
        <div
          className={cn(
            "fixed inset-0 z-[68] bg-[rgba(17,24,39,0.34)] backdrop-blur-[3px] transition-opacity duration-200 min-[1025px]:hidden",
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
            "fixed inset-y-0 right-0 z-[74] w-[min(91vw,24.75rem)] max-w-[24.75rem] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] min-[1025px]:hidden",
            mobileMenuOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
          )}
          onTouchStart={handleDrawerTouchStart}
          onTouchMove={handleDrawerTouchMove}
          onTouchEnd={handleDrawerTouchEnd}
          onTouchCancel={resetTouchTracking}
        >
          <div className="flex h-full flex-col overflow-hidden rounded-l-[24px] border-l border-white/10 bg-[#2A2A2A] text-white shadow-[-22px_0_48px_rgba(0,0,0,0.28)]">
            <div className="border-b border-white/10 px-4 pb-3 pt-[max(env(safe-area-inset-top,0px),0.85rem)]">
              <div className="flex justify-center">
                <span className="h-1.5 w-14 rounded-full bg-white/20" />
              </div>

              <div className="mt-3 flex items-center gap-2.5">
                <div className="flex min-h-[36px] min-w-0 flex-1 items-center justify-center px-1">
                  <img
                    src={ADMIN_BRAND_LOGO_SRC}
                    alt="Celebix"
                    className="block object-contain"
                    style={{ width: "136px", height: "auto" }}
                  />
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] border border-white/15 bg-white/8 text-white/75 shadow-[0_10px_20px_rgba(0,0,0,0.14)] transition-colors active:scale-[0.98] hover:bg-white/12 hover:text-white"
                  aria-label="Menüyü kapat"
                >
                  <X className="h-[1.1rem] w-[1.1rem]" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3.5 pb-3 pt-3">
              {!role && !isRecoveringProfile ? (
                <div className="rounded-[0.9rem] border border-white/10 bg-white/[0.06] px-3 py-2.5 text-[12.5px] font-medium text-white/62">
                  Yetki bilgisi yüklenemedi.
                </div>
              ) : null}

              <section className={cn("space-y-2.5", !role && !isRecoveringProfile ? "mt-3" : "")}>
                <div className="px-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
                    Menü
                  </p>
                </div>

                <div className="overflow-hidden rounded-[1rem] border border-white/10 bg-black/10">
                  {filteredItems.map((item, index) => {
                    const { hasSubmenu, isExpanded, isActive } = getItemState(item);
                    const rowId = `admin-mobile-drawer-section-${index}`;
                    const statusLabel = item.badge;

                      const rowClasses = cn(
                        "group relative flex min-h-[46px] w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-200 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(255,106,0,0.16)]",
                        isActive ? "bg-[#37373B] text-white" : "bg-transparent text-white/82 hover:bg-white/[0.06] hover:text-white",
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
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.75rem] transition-colors",
                              isActive ? "bg-white/[0.1] text-white" : "bg-white/[0.06] text-white/72",
                          )}
                        >
                          <item.icon className="h-[0.98rem] w-[0.98rem]" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium tracking-[-0.005em]">
                          {item.title}
                        </span>
                        {statusLabel ? (
                          <span className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[11px] font-medium text-white/58">
                            {statusLabel}
                          </span>
                        ) : null}
                        <ChevronRight
                          className={cn(
                              "h-3.5 w-3.5 shrink-0 text-white/40 transition-transform duration-200",
                              hasSubmenu && isExpanded ? "rotate-90 text-[#FF6A00]" : "",
                              !hasSubmenu && isActive ? "text-[#FF6A00]" : "",
                          )}
                        />
                      </>
                    );

                    return (
                        <div key={item.title} className={cn(index > 0 ? "border-t border-white/[0.06]" : "")}>
                        {hasSubmenu ? (
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
                              <div className="pb-2 pl-[3.3rem] pr-3">
                                  <div className="space-y-0.5 border-l border-white/10 pl-2.5">
                                  {item.submenu?.map((sub, subIndex, submenu) => {
                                    const isSubActive = submenuPathMatches(pathname, sub.href, item.href);
                                    const previousGroup = subIndex > 0 ? submenu[subIndex - 1]?.group : undefined;
                                    const shouldShowGroup = Boolean(sub.group && sub.group !== previousGroup);

                                    return (
                                      <div key={sub.href} className="space-y-1">
                                        {shouldShowGroup ? (
                                            <p className="px-2.5 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/34">
                                            {sub.group}
                                          </p>
                                        ) : null}
                                        <Link
                                          href={sub.href}
                                          aria-current={isSubActive ? "page" : undefined}
                                          onClick={handleLeafClick}
                                          className={cn(
                                              "flex min-h-[34px] items-center gap-2 rounded-[0.75rem] px-2.5 py-1.5 text-[12.5px] transition-colors duration-200 active:scale-[0.995]",
                                              isSubActive
                                                ? "bg-white/[0.1] text-white"
                                                : "text-white/62 hover:bg-white/[0.06] hover:text-white",
                                          )}
                                        >
                                          <span
                                            className={cn(
                                              "h-1.5 w-1.5 shrink-0 rounded-full",
                                                isSubActive ? "bg-[#FF6A00]" : "bg-white/22",
                                            )}
                                          />
                                          <span className="min-w-0 flex-1 truncate">{sub.title}</span>
                                          {sub.badge ? (
                                              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/58">
                                              {sub.badge}
                                            </span>
                                          ) : null}
                                        </Link>
                                      </div>
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

            <div className="border-t border-white/10 bg-[#232323] px-3.5 pb-[max(env(safe-area-inset-bottom,0px),0.65rem)] pt-2">
              <div className="flex items-center gap-2 px-1">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/14 bg-black/14 text-[10.5px] font-semibold text-white">
                  {adminInitials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold tracking-[-0.005em] text-white">{adminFullName}</p>
                  <p className="truncate text-[10.5px] text-white/48">
                    {siteName} · {adminRoleLabel}
                  </p>
                </div>
                {isLogtoProvider ? (
                  <a
                    href={logtoLogoutHref}
                    aria-label="Çıkış yap"
                    title="Çıkış Yap"
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-[0.6rem] px-2 text-[11.5px] font-medium text-white/52 transition-colors duration-200 active:scale-[0.98] hover:bg-[#4A2A2A] hover:text-[#FF8A8A]"
                  >
                    <LogOut className="h-[0.9rem] w-[0.9rem] shrink-0" />
                    <span>Çıkış</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isSigningOut}
                    aria-label="Çıkış yap"
                    title="Çıkış Yap"
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-[0.6rem] px-2 text-[11.5px] font-medium text-white/52 transition-colors duration-200 active:scale-[0.98] hover:bg-[#4A2A2A] hover:text-[#FF8A8A] disabled:opacity-60"
                  >
                    <LogOut className="h-[0.9rem] w-[0.9rem] shrink-0" />
                    <span>{isSigningOut ? "..." : "Çıkış"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside className={cn("border-r border-white/10", desktopAsideClassName)}>
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex min-h-[34px] items-center justify-center px-1">
          <img
            src={ADMIN_BRAND_LOGO_SRC}
            alt="Celebix"
            className="block object-contain"
            style={{ width: "136px", height: "auto" }}
          />
        </div>
      </div>

      {!role && !isRecoveringProfile ? (
        <div className="mx-3.5 mt-3 rounded-[0.9rem] border border-white/10 bg-white/[0.06] px-3 py-2.5 text-[12.5px] font-medium text-white/62">
          Yetki bilgisi yüklenemedi.
        </div>
      ) : null}

      <nav className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
        {groupedItems.map((group) => (
          <section key={group.id} className="space-y-1">
            <div className="px-1.5">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/38">
                {group.label}
              </p>
            </div>

            <div className="space-y-0.5">
              {group.items.map((item) => {
                const { hasSubmenu, isExpanded, isActive } = getItemState(item);
                const statusLabel = item.badge;

                const rowClasses = cn(
                  "group relative flex min-h-[42px] w-full items-center gap-2.5 rounded-[0.75rem] border border-transparent px-2.5 py-2 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(254,97,0,0.32)]",
                  isActive
                    ? "bg-[#37373B] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
                    : "text-white/84 hover:bg-white/[0.06] hover:text-white",
                );

                const iconShellClasses = cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] border transition-colors",
                  isActive
                    ? "border-white/12 bg-white/[0.1] text-white"
                    : "border-white/10 bg-black/10 text-white/72 group-hover:border-white/16 group-hover:text-white",
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
                      <item.icon className="h-[0.96rem] w-[0.96rem]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{item.title}</span>
                    {statusLabel ? (
                      <span className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[11px] font-medium text-white/58">
                        {statusLabel}
                      </span>
                    ) : null}
                    {hasSubmenu ? (
                      <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-white/42 transition-transform duration-200 group-hover:text-white/72",
                            isExpanded ? "rotate-180" : "rotate-0",
                          )}
                      />
                    ) : null}
                  </>
                );

                return (
                  <div key={item.title} className="space-y-1">
                    {hasSubmenu ? (
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
                            <div className="ml-4 border-l border-white/10 pl-2.5 pt-0.5">
                            <div className="space-y-0.5">
                              {item.submenu?.map((sub, subIndex, submenu) => {
                                const isSubActive = submenuPathMatches(pathname, sub.href, item.href);
                                const previousGroup = subIndex > 0 ? submenu[subIndex - 1]?.group : undefined;
                                const shouldShowGroup = Boolean(sub.group && sub.group !== previousGroup);

                                return (
                                  <div key={sub.href} className="space-y-1">
                                    {shouldShowGroup ? (
                                        <p className="px-2.5 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/34">
                                        {sub.group}
                                      </p>
                                    ) : null}
                                    <Link
                                      href={sub.href}
                                      aria-current={isSubActive ? "page" : undefined}
                                      onClick={handleLeafClick}
                                        className={cn(
                                          "group flex min-h-[32px] items-center gap-2 rounded-[0.7rem] px-2.5 py-1.5 text-[12.5px] transition-colors",
                                          isSubActive
                                            ? "bg-white/[0.1] text-white"
                                            : "text-white/62 hover:bg-white/[0.06] hover:text-white",
                                        )}
                                    >
                                      <span
                                        className={cn(
                                          "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                                            isSubActive
                                              ? "bg-[#FE6100]"
                                              : "bg-white/22 group-hover:bg-white/42",
                                        )}
                                      />
                                      <span className="min-w-0 flex-1 truncate">{sub.title}</span>
                                        {sub.badge ? (
                                          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/58">
                                            {sub.badge}
                                          </span>
                                      ) : null}
                                    </Link>
                                  </div>
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

      <div className="border-t border-white/10 bg-[#232323] px-3.5 py-2">
        <div className="flex items-center gap-2 px-1">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/14 bg-black/14 text-[10.5px] font-semibold text-white">
            {adminInitials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold tracking-[-0.005em] text-white">{adminFullName}</p>
            <p className="truncate text-[10.5px] text-white/48">
              {siteName} · {adminRoleLabel}
            </p>
          </div>
          {isLogtoProvider ? (
            <a
              href={logtoLogoutHref}
              aria-label="Çıkış yap"
              title="Çıkış Yap"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-[0.6rem] px-2 text-[11.5px] font-medium text-white/52 transition-colors hover:bg-[#4A2A2A] hover:text-[#FF8A8A]"
            >
              <LogOut className="h-[0.9rem] w-[0.9rem] shrink-0" />
              <span>Çıkış</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              disabled={isSigningOut}
              aria-label="Çıkış yap"
              title="Çıkış Yap"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-[0.6rem] px-2 text-[11.5px] font-medium text-white/52 transition-colors hover:bg-[#4A2A2A] hover:text-[#FF8A8A] disabled:opacity-60"
            >
              <LogOut className="h-[0.9rem] w-[0.9rem] shrink-0" />
              <span>{isSigningOut ? "..." : "Çıkış"}</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
