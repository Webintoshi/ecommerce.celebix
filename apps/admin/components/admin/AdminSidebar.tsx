"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  Calculator,
  ChevronDown,
  FileText,
  Home,
  LogOut,
  Megaphone as MarketingIcon,
  Package,
  Percent,
  Search,
  Settings,
  Store,
  Tag,
  TrendingUp,
  Users,
  Users as AdminsIcon,
  X,
} from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { useStoreInfo } from "@/lib/store-info-context";
import { cn } from "@/lib/utils";
import { hasActionPermission, hasPermission, type AdminPermission, type UserRole } from "@/lib/permissions";
import type { InitialAdminProfile } from "@/lib/admin-data-types";

const ADMIN_BRAND_LOGO_SRC = "/branding/celebix-x.svg";

interface MenuItem {
  title: string;
  icon: ElementType;
  href: string;
  badge?: number;
  permission?: AdminPermission;
  submenu?: Array<{
    title: string;
    href: string;
  }>;
}

type MenuGroup = {
  id: string;
  label: string;
  titles: string[];
};

const MENU_ITEMS: MenuItem[] = [
  { title: "Ana Sayfa", icon: Home, href: "/admin" },
  {
    title: "Siparişler",
    icon: Package,
    href: "/admin/siparisler",
    submenu: [
      { title: "Tüm Siparişler", href: "/admin/siparisler" },
      { title: "Terk Edilen Sepetler", href: "/admin/siparisler/sepet-terk" },
      { title: "Hızlı Sipariş", href: "/admin/siparisler/hizli-siparis" },
    ],
  },
  {
    title: "Ürünler",
    icon: Tag,
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
    title: "İçerik",
    icon: FileText,
    href: "/admin/cms",
    submenu: [
      { title: "Blog Yazıları", href: "/admin/cms/blog" },
      { title: "Sayfalar", href: "/admin/cms/sayfalar" },
      { title: "Politikalar", href: "/admin/cms/politikalar" },
    ],
  },
  {
    title: "Pazarlama",
    icon: MarketingIcon,
    href: "/admin/pazarlama",
    submenu: [
      { title: "Kampanyalar", href: "/admin/pazarlama" },
      { title: "E-posta", href: "/admin/pazarlama/email" },
      { title: "SMS", href: "/admin/pazarlama/phone" },
      { title: "WhatsApp", href: "/admin/pazarlama/whatsapp" },
    ],
  },
  { title: "Analizler", icon: TrendingUp, href: "/admin/analizler" },
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
  { title: "Marketplace", icon: Store, href: "/admin/markets" },
  { title: "Yöneticiler", icon: AdminsIcon, href: "/admin/yoneticiler" },
  { title: "Ayarlar", icon: Settings, href: "/admin/ayarlar" },
];

const MENU_GROUPS: MenuGroup[] = [
  { id: "general", label: "Genel", titles: ["Ana Sayfa"] },
  { id: "catalog", label: "Katalog", titles: ["Siparişler", "Ürünler", "İçerik"] },
  { id: "customers", label: "Müşteri", titles: ["Müşteriler", "İndirimler"] },
  { id: "marketing", label: "Pazarlama", titles: ["Pazarlama", "SEO Araçları", "Marketplace"] },
  { id: "reporting", label: "Raporlama", titles: ["Analizler", "Muhasebe"] },
  { id: "system", label: "Sistem", titles: ["Yöneticiler", "Ayarlar"] },
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

  const role: UserRole | null = resolvedProfile?.role || null;
  const adminFullName = deriveAdminName(resolvedProfile);
  const siteName = (storeInfo?.name || STORE_RUNTIME.name).trim();
  const siteHeading = /admin/i.test(siteName) ? siteName : `${siteName} Admin`;
  const siteLogo = storeInfo?.logoUrl || ADMIN_BRAND_LOGO_SRC;
  const mobileMenuOpen = isMobile ? isOpen : true;

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
      if (!hasPermission(role, item.href)) {
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

  const mobileAsideClassName =
    "fixed inset-x-3 top-[var(--admin-mobile-panel-top)] bottom-[var(--admin-mobile-panel-bottom)] z-[74] h-auto rounded-[2rem] border border-[var(--admin-border)] bg-white shadow-[0_28px_70px_rgba(17,24,39,0.14)] backdrop-blur-2xl";
  const desktopAsideClassName =
    "sticky top-0 z-20 h-screen w-[13.75rem] shrink-0 bg-white xl:w-[14rem] 2xl:w-[14.5rem]";

  return (
    <>
      {isMobile && mobileMenuOpen ? (
        <button
          type="button"
          aria-label="Menüyü kapat"
          className="fixed inset-x-0 top-[var(--admin-mobile-panel-top)] bottom-[var(--admin-mobile-panel-bottom)] z-[68] bg-[rgba(17,24,39,0.12)] backdrop-blur-[2px] md:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={cn(
          "flex flex-col border-l border-[var(--admin-border)] bg-white transition-all duration-300",
          isMobile
            ? `${mobileAsideClassName} ${
                mobileMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
              }`
            : desktopAsideClassName,
        )}
      >
        <div className={cn("border-b border-[#EEF1F4]", isMobile ? "px-4 py-4" : "px-3.5 py-4")}>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden rounded-[1.05rem] border border-[var(--admin-border)] bg-[var(--admin-bg)] shadow-[0_10px_24px_rgba(17,24,39,0.05)]",
                isMobile ? "h-11 w-11" : "h-10 w-10",
              )}
            >
              <Image
                src={siteLogo}
                alt={siteName}
                width={44}
                height={44}
                className="h-full w-full object-cover"
                unoptimized
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className={cn("truncate font-semibold tracking-[-0.02em] text-[var(--admin-heading)]", isMobile ? "text-[15px]" : "text-[14.5px]")}>
                {siteHeading}
              </p>
              <p className={cn("mt-0.5 truncate text-[var(--admin-text-secondary)]", isMobile ? "text-[13px]" : "text-[12.5px]")}>
                {adminFullName}
              </p>
            </div>

            {isMobile ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[1rem] border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-[0_10px_18px_rgba(17,24,39,0.05)]"
                aria-label="Menüyü kapat"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {!role && !isRecoveringProfile ? (
          <div className="mx-3.5 mt-3 rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-bg)] px-3 py-2.5 text-[13px] font-medium text-[var(--admin-text-secondary)]">
            Yetki bilgisi yüklenemedi.
          </div>
        ) : null}

        <nav className={cn("flex-1 overflow-y-auto", isMobile ? "space-y-5 px-3.5 py-4" : "space-y-4 px-3 py-4")}>
          {groupedItems.map((group) => (
            <section key={group.id} className="space-y-1.5">
              <div className={cn(isMobile ? "px-1.5" : "px-1")}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-text-secondary)]">
                  {group.label}
                </p>
              </div>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const hasSubmenu = Boolean(item.submenu?.length);
                  const isDirectActive = pathMatches(pathname, item.href) && !hasSubmenu;
                  const isParentActive = hasSubmenu && pathMatches(pathname, item.href);
                  const isSubmenuActive = item.submenu?.some((sub) => pathMatches(pathname, sub.href)) ?? false;
                  const isExpanded = expandedMenus.includes(item.title);
                  const isActive = isDirectActive || isParentActive || isSubmenuActive;

                  const rowClasses = cn(
                    "group relative flex w-full items-center gap-3 rounded-[1rem] border border-transparent px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(255,106,0,0.14)]",
                    isMobile ? "min-h-[54px]" : "min-h-[44px]",
                    isActive
                      ? "bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]"
                      : "text-[var(--admin-text)] hover:bg-[var(--admin-bg)] hover:text-[var(--admin-heading)]",
                  );

                  const iconShellClasses = cn(
                    "flex shrink-0 items-center justify-center rounded-[0.95rem] border transition-colors",
                    isMobile ? "h-10 w-10" : "h-9 w-9",
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
                        <item.icon className={cn(isMobile ? "h-[1.15rem] w-[1.15rem]" : "h-[1rem] w-[1rem]")} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{item.title}</span>
                      {item.badge ? (
                        <span className="rounded-full border border-[var(--admin-border)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--admin-text-secondary)]">
                          {item.badge}
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
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          onClick={handleLeafClick}
                          className={rowClasses}
                        >
                          {content}
                        </Link>
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
                            <div className={cn("ml-5 border-l border-[#EEF1F4] pl-3", isMobile ? "pt-1" : "pt-0.5")}>
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
                                          isSubActive ? "bg-[var(--admin-accent)]" : "bg-[#D1D5DB] group-hover:bg-[var(--admin-accent-border)]",
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

        <div className={cn("border-t border-[#EEF1F4]", isMobile ? "space-y-1.5 p-3.5" : "space-y-1.5 px-3 py-3.5")}>
          <button
            onClick={handleLogout}
            disabled={isSigningOut}
            className={cn(
              "flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-[14px] font-medium transition-colors",
              "text-[var(--admin-text-secondary)] hover:bg-[var(--admin-danger-soft)] hover:text-[var(--admin-danger)]",
            )}
          >
            <LogOut className="h-[1rem] w-[1rem] shrink-0" />
            <span>{isSigningOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}</span>
          </button>

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
    </>
  );
}
