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
import { cn } from "@/lib/utils";
import { hasActionPermission, hasPermission, type AdminPermission, type UserRole } from "@/lib/permissions";
import type { InitialAdminProfile } from "@/lib/admin-data-types";

const ADMIN_BRAND_LOGO_SRC = "/branding/celebix-x.svg";
const QUICK_ACCESS_TITLES = ["Ana Sayfa", "Siparişler", "Ürünler", "Müşteriler", "Ayarlar"] as const;

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

const MENU_ITEMS: MenuItem[] = [
  { title: "Ana Sayfa", icon: Home, href: "/admin" },
  {
    title: "Siparişler",
    icon: Package,
    href: "/admin/siparisler",
    submenu: [
      { title: "Tüm Siparişler", href: "/admin/siparisler" },
      { title: "Terkedilen Sepetler", href: "/admin/siparisler/sepet-terk" },
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

function getRoleLabel(role: UserRole | null) {
  switch (role) {
    case "super_admin":
      return "Süper admin";
    case "product_manager":
      return "Ürün yöneticisi";
    case "content_creator":
      return "İçerik ekibi";
    case "order_manager":
      return "Sipariş ekibi";
    default:
      return "Admin";
  }
}

export function AdminSidebar({
  isOpen = true,
  onClose,
  initialProfile = null,
}: SidebarProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [resolvedProfile, setResolvedProfile] = useState<InitialAdminProfile | null>(initialProfile);
  const [isRecoveringProfile, setIsRecoveringProfile] = useState(false);
  const [hasAttemptedProfileRecovery, setHasAttemptedProfileRecovery] = useState(Boolean(initialProfile?.role));

  const userEmail = resolvedProfile?.email;
  const userName = resolvedProfile?.fullName || userEmail?.split("@")[0] || "Admin Kullanıcı";
  const role: UserRole | null = resolvedProfile?.role || null;
  const roleLabel = getRoleLabel(role);
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
    const autoExpand = MENU_ITEMS.filter((item) => item.submenu?.some((sub) => sub.href === pathname)).map(
      (item) => item.title,
    );

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

  const quickAccessItems = useMemo(
    () => filteredItems.filter((item) => QUICK_ACCESS_TITLES.includes(item.title as (typeof QUICK_ACCESS_TITLES)[number])),
    [filteredItems],
  );

  const toggleMenu = (title: string) => {
    setExpandedMenus((prev) => {
      const isExpanded = prev.includes(title);

      if (isMobile) {
        return isExpanded ? [] : [title];
      }

      return isExpanded ? prev.filter((item) => item !== title) : [...prev, title];
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
    "fixed inset-x-3 top-[var(--admin-mobile-panel-top)] bottom-[var(--admin-mobile-panel-bottom)] z-[74] h-auto rounded-[2rem] border border-[#ead8ca] bg-[linear-gradient(180deg,rgba(250,245,239,0.98)_0%,rgba(244,236,227,0.98)_100%)] shadow-[0_24px_60px_rgba(58,36,18,0.18)] backdrop-blur-2xl";
  const desktopAsideClassName =
    "sticky top-0 z-20 h-screen w-[13.5rem] shrink-0 bg-[#eee5dc] xl:w-56 2xl:w-[14.5rem]";

  return (
    <>
      {isMobile && mobileMenuOpen ? (
        <button
          type="button"
          aria-label="Menüyü kapat"
          className="fixed inset-x-0 top-[var(--admin-mobile-panel-top)] bottom-[var(--admin-mobile-panel-bottom)] z-[68] bg-[rgba(41,25,12,0.12)] backdrop-blur-[2px] md:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={cn(
          "flex flex-col border-l border-[#e6d7c8] bg-[#f2e9df] transition-all duration-300",
          isMobile
            ? `${mobileAsideClassName} ${
                mobileMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
              }`
            : desktopAsideClassName,
        )}
      >
        <div className={cn("border-b border-[#e6d7c8]", isMobile ? "px-4 py-4 xl:px-[1.125rem] 2xl:px-5" : "px-3 py-3.5 xl:px-3.5 2xl:px-4")}>
          <div className={cn("flex items-center", isMobile ? "gap-4" : "gap-3")}>
            <div
              className={cn(
                "flex items-center justify-center overflow-hidden bg-white shadow-sm ring-1 ring-black/5",
                isMobile ? "h-12 w-12 rounded-[1.35rem]" : "h-10 w-10 rounded-[1.05rem]",
              )}
            >
              <Image
                src={ADMIN_BRAND_LOGO_SRC}
                alt="Celebix X"
                width={40}
                height={40}
                className={cn("h-full w-full object-contain", isMobile ? "p-[0.4rem]" : "p-[0.34rem]")}
                priority
                unoptimized
              />
            </div>

            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "block break-words font-semibold leading-snug text-gray-900",
                  isMobile ? "text-base" : "text-[15px]",
                )}
              >
                {STORE_RUNTIME.name} Admin
              </span>
              <span
                className={cn(
                  "mt-1 inline-flex items-center rounded-full border border-[#ecd9c6] bg-white/75 font-medium uppercase text-[#8a5a33]",
                  isMobile ? "px-2.5 py-1 text-[11px] tracking-[0.14em]" : "px-2 py-0.5 text-[10px] tracking-[0.12em]",
                )}
              >
                {roleLabel}
              </span>
            </div>

            {isMobile ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[1rem] border border-[#e8d7c8] bg-white/85 text-[#7b6a5f] shadow-[0_10px_18px_rgba(112,73,44,0.08)]"
                aria-label="Menüyü kapat"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div
            className={cn(
              "border border-[#ead8ca] bg-white/70",
              isMobile ? "mt-4 rounded-[1.4rem] px-3.5 py-3" : "mt-3 rounded-[1.05rem] px-3 py-2.5",
            )}
          >
            <p className={cn("truncate font-semibold text-gray-900", isMobile ? "text-sm" : "text-[13px]")}>{userName}</p>
            <p className={cn("mt-1 truncate text-gray-500", isMobile ? "text-sm" : "text-[12px]")}>
              {userEmail || "Profil bekleniyor"}
            </p>
          </div>
        </div>

        {!role && !isRecoveringProfile ? (
          <div className="mx-4 mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] font-medium leading-5 text-amber-800">
            Yetki bilgisi yüklenemedi.
          </div>
        ) : null}

        {isMobile && quickAccessItems.length > 0 ? (
          <div className="px-4 pb-3 pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a5a33]">Hızlı erişim</p>
              <p className="text-xs text-[#8f7b6d]">En çok kullanılan yüzeyler</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quickAccessItems.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    onClick={handleLeafClick}
                    className={cn(
                      "flex min-h-[60px] items-center gap-3 rounded-[1.3rem] border px-3.5 py-3 transition-all active:scale-[0.99]",
                      active
                        ? "border-[#FE6100]/18 bg-[#fff4eb] text-[#d95a08] shadow-[0_12px_22px_rgba(254,97,0,0.08)]"
                        : "border-[#ead8ca] bg-white/80 text-[#5f5248]",
                    )}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-white shadow-[0_8px_16px_rgba(112,73,44,0.06)]">
                      <item.icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 text-sm font-semibold">{item.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        <nav className={cn("flex-1 overflow-y-auto", isMobile ? "space-y-2.5 px-3.5 py-4" : "space-y-1.5 px-2.5 py-3.5")}>
          <div className={cn(isMobile ? "px-1" : "px-1.5")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a5a33]">Tüm alanlar</p>
          </div>

          {filteredItems.map((item) => {
            const hasSubmenu = Boolean(item.submenu?.length);
            const isDirectActive =
              pathname === item.href ||
              (!hasSubmenu && item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            const isExpanded = expandedMenus.includes(item.title);
            const isSubmenuActive = item.submenu?.some((sub) => pathname === sub.href) ?? false;
            const rowActive = isDirectActive || isSubmenuActive;

            return (
              <div key={item.title} className={cn(isMobile ? "space-y-1.5" : "space-y-1")}>
                {hasSubmenu ? (
                  <button
                    type="button"
                    onClick={() => toggleMenu(item.title)}
                    aria-expanded={isExpanded}
                    aria-controls={`sidebar-group-${item.title}`}
                    className={cn(
                      "group flex w-full items-center justify-between text-left font-semibold transition-all active:scale-[0.99]",
                      isMobile
                        ? "min-h-[60px] rounded-[1.6rem] px-4 py-3.5 text-base"
                        : "min-h-[46px] rounded-[1.15rem] px-3 py-2 text-[14px]",
                      rowActive
                        ? isMobile
                          ? "bg-white text-gray-900 shadow-[0_12px_24px_rgba(0,0,0,0.06)]"
                          : "bg-white/92 text-gray-900 shadow-[0_8px_18px_rgba(0,0,0,0.045)]"
                        : isMobile
                          ? "text-gray-600 hover:bg-white/80 hover:text-gray-900"
                          : "text-[#65584f] hover:bg-white/80 hover:text-gray-900",
                    )}
                  >
                    <span className={cn("flex min-w-0 items-center", isMobile ? "gap-3.5" : "gap-2.5")}>
                      <span
                        className={cn(
                          "flex shrink-0 items-center justify-center transition-colors",
                          isMobile
                            ? "text-current"
                            : rowActive
                              ? "h-8 w-8 rounded-[0.95rem] border border-[#f3ded0] bg-[#fff4eb] text-[#d95a08] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                              : "h-8 w-8 rounded-[0.95rem] border border-[#ece1d7] bg-white/72 text-[#7a6b60]",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "shrink-0 opacity-80",
                            isMobile ? "h-[1.45rem] w-[1.45rem]" : "h-[1.1rem] w-[1.1rem]",
                          )}
                        />
                      </span>
                      <span className="min-w-0 truncate leading-snug">{item.title}</span>
                    </span>

                    <span
                      className={cn(
                        "flex shrink-0 items-center justify-center text-[#7b6a5f] transition-colors group-hover:border-[#FE6100]/20 group-hover:text-[#d95a08]",
                        isMobile
                          ? "h-12 w-12 rounded-full border border-[#efe1d2] bg-[#f8f2eb]"
                          : "h-8 w-8 rounded-[0.95rem] border border-[#eadfd4] bg-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]",
                      )}
                    >
                      <ChevronDown
                        className={cn(
                          "transition-transform duration-200",
                          isMobile ? "h-[1.15rem] w-[1.15rem]" : "h-[0.95rem] w-[0.95rem]",
                          isExpanded ? "rotate-180" : "rotate-0",
                        )}
                      />
                    </span>
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    onClick={handleLeafClick}
                    className={cn(
                      "group flex items-center justify-between font-semibold transition-all active:scale-[0.99]",
                      isMobile
                        ? "min-h-[60px] rounded-[1.6rem] px-4 py-3.5 text-base"
                        : "min-h-[46px] rounded-[1.15rem] px-3 py-2 text-[14px]",
                      rowActive
                        ? isMobile
                          ? "bg-white text-gray-900 shadow-[0_12px_24px_rgba(0,0,0,0.06)]"
                          : "bg-white/92 text-gray-900 shadow-[0_8px_18px_rgba(0,0,0,0.045)]"
                        : isMobile
                          ? "text-gray-600 hover:bg-white/80 hover:text-gray-900"
                          : "text-[#65584f] hover:bg-white/80 hover:text-gray-900",
                    )}
                  >
                    <span className={cn("flex min-w-0 items-center", isMobile ? "gap-3.5" : "gap-2.5")}>
                      <span
                        className={cn(
                          "flex shrink-0 items-center justify-center transition-colors",
                          isMobile
                            ? "text-current"
                            : rowActive
                              ? "h-8 w-8 rounded-[0.95rem] border border-[#f3ded0] bg-[#fff4eb] text-[#d95a08] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                              : "h-8 w-8 rounded-[0.95rem] border border-[#ece1d7] bg-white/72 text-[#7a6b60]",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "shrink-0 opacity-80",
                            isMobile ? "h-[1.45rem] w-[1.45rem]" : "h-[1.1rem] w-[1.1rem]",
                          )}
                        />
                      </span>
                      <span className="min-w-0 truncate leading-snug">{item.title}</span>
                    </span>
                    {item.badge ? (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                )}

                {hasSubmenu ? (
                  <div
                    id={`sidebar-group-${item.title}`}
                    className={cn(
                      "grid overflow-hidden transition-all duration-300 ease-out",
                      isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="min-h-0">
                      <div className={cn(isMobile ? "ml-5 border-l border-[#ead8c8] pl-4 pt-1" : "ml-4 border-l border-[#eadfd4] pl-3.5 pt-0.5")}>
                        <div className={cn(isMobile ? "space-y-2" : "space-y-1")}>
                          {item.submenu?.map((sub) => {
                            const isSubActive = pathname === sub.href;
                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                onClick={handleLeafClick}
                                className={cn(
                                  "flex items-center font-medium transition-all active:scale-[0.99]",
                                  isMobile
                                    ? "min-h-[52px] rounded-[1.2rem] px-4 py-2.5 text-[0.98rem] leading-5"
                                    : "min-h-[39px] rounded-[0.95rem] px-3 py-2 text-[13px] leading-[1.2rem]",
                                  isSubActive
                                    ? isMobile
                                      ? "bg-white text-gray-900 shadow-[0_8px_18px_rgba(0,0,0,0.05)]"
                                      : "bg-white/88 text-gray-900 shadow-[0_6px_14px_rgba(0,0,0,0.04)]"
                                    : isMobile
                                      ? "text-gray-500 hover:bg-white/70 hover:text-gray-900"
                                      : "text-[#766a60] hover:bg-white/70 hover:text-gray-900",
                                )}
                              >
                                {sub.title}
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
        </nav>

        <div className={cn("border-t border-[#e6d7c8]", isMobile ? "space-y-2.5 p-4" : "space-y-1.5 px-2.5 py-3")}>
          <button
            onClick={handleLogout}
            disabled={isSigningOut}
            className={cn(
              "flex w-full items-center font-medium transition-colors",
              isMobile
                ? "min-h-[54px] gap-3.5 rounded-[1.4rem] px-4 py-3 text-base text-gray-600 hover:bg-red-50 hover:text-red-600"
                : "min-h-[44px] gap-3 rounded-[1rem] px-3 py-2.5 text-[14px] text-[#65584f] hover:bg-red-50 hover:text-red-600",
            )}
          >
            <LogOut className={cn("opacity-75", isMobile ? "h-[1.4rem] w-[1.4rem]" : "h-[1.1rem] w-[1.1rem]")} />
            <span>{isSigningOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}</span>
          </button>

          <Link
            href={STORE_RUNTIME.storefrontUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "flex items-center font-medium transition-colors",
              isMobile
                ? "min-h-[54px] gap-3.5 rounded-[1.4rem] px-4 py-3 text-base text-gray-600 hover:bg-white/70 hover:text-gray-900"
                : "min-h-[44px] gap-3 rounded-[1rem] px-3 py-2.5 text-[14px] text-[#65584f] hover:bg-white/70 hover:text-gray-900",
            )}
          >
            <Store className={cn("opacity-75", isMobile ? "h-[1.4rem] w-[1.4rem]" : "h-[1.1rem] w-[1.1rem]")} />
            <span>Siteye Dön</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
