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
} from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { STORE_RUNTIME } from "@/lib/store-runtime";
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
  const mobileMenuOpen = isMobile ? isOpen : true;

  useEffect(() => {
    setResolvedProfile(initialProfile);
    setIsRecoveringProfile(false);
    setHasAttemptedProfileRecovery(Boolean(initialProfile?.role));
  }, [initialProfile]);

  useEffect(() => {
    const checkMobile = () => {
      if (typeof window !== "undefined") {
        setIsMobile(window.innerWidth < 768);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
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

  const toggleMenu = (title: string) => {
    setExpandedMenus((prev) => (prev.includes(title) ? prev.filter((item) => item !== title) : [...prev, title]));
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
            : "sticky top-0 z-20 h-screen w-56 shrink-0 bg-[#eee5dc] xl:w-[15rem] 2xl:w-64",
        )}
      >
        <div className="flex items-center gap-4 border-b border-[#e6d7c8] px-4 py-4 xl:px-[1.125rem] 2xl:px-5">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[1.35rem] bg-white shadow-sm ring-1 ring-black/5">
            <Image
              src={ADMIN_BRAND_LOGO_SRC}
              alt="Celebix X"
              width={40}
              height={40}
              className="h-full w-full object-contain p-[0.4rem]"
              priority
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block break-words text-base font-semibold leading-snug text-gray-900">
              {STORE_RUNTIME.name} Admin
            </span>
            <span className="block truncate text-[0.95rem] font-medium text-gray-500">{userName}</span>
          </div>
        </div>

        {!role && !isRecoveringProfile ? (
          <div className="mx-4 mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] font-medium leading-5 text-amber-800">
            Yetki bilgisi yüklenemedi.
          </div>
        ) : null}

        <nav className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-4">
          {filteredItems.map((item) => {
            const hasSubmenu = Boolean(item.submenu?.length);
            const isDirectActive =
              pathname === item.href ||
              (!hasSubmenu && item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            const isExpanded = expandedMenus.includes(item.title);
            const isSubmenuActive = item.submenu?.some((sub) => pathname === sub.href) ?? false;
            const rowActive = isDirectActive || isSubmenuActive;

            return (
              <div key={item.title} className="space-y-1.5">
                {hasSubmenu ? (
                  <button
                    type="button"
                    onClick={() => toggleMenu(item.title)}
                    aria-expanded={isExpanded}
                    aria-controls={`sidebar-group-${item.title}`}
                    className={cn(
                      "group flex min-h-[60px] w-full items-center justify-between rounded-[1.6rem] px-4 py-3.5 text-left text-base font-semibold transition-all active:scale-[0.99]",
                      rowActive
                        ? "bg-white text-gray-900 shadow-[0_12px_24px_rgba(0,0,0,0.06)]"
                        : "text-gray-600 hover:bg-white/80 hover:text-gray-900",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3.5">
                      <item.icon className="h-[1.45rem] w-[1.45rem] shrink-0 opacity-80" />
                      <span className="min-w-0 truncate leading-snug">{item.title}</span>
                    </span>

                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#efe1d2] bg-[#f8f2eb] text-[#7b6a5f] transition-colors group-hover:border-[#FE6100]/20 group-hover:text-[#d95a08]">
                      <ChevronDown
                        className={cn(
                          "h-[1.15rem] w-[1.15rem] transition-transform duration-200",
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
                      "group flex min-h-[60px] items-center justify-between rounded-[1.6rem] px-4 py-3.5 text-base font-semibold transition-all active:scale-[0.99]",
                      rowActive
                        ? "bg-white text-gray-900 shadow-[0_12px_24px_rgba(0,0,0,0.06)]"
                        : "text-gray-600 hover:bg-white/80 hover:text-gray-900",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3.5">
                      <item.icon className="h-[1.45rem] w-[1.45rem] shrink-0 opacity-80" />
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
                      <div className="ml-5 border-l border-[#ead8c8] pl-4 pt-1">
                        <div className="space-y-2">
                          {item.submenu?.map((sub) => {
                            const isSubActive = pathname === sub.href;
                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                onClick={handleLeafClick}
                                className={cn(
                                  "flex min-h-[52px] items-center rounded-[1.2rem] px-4 py-2.5 text-[0.98rem] font-medium leading-5 transition-all active:scale-[0.99]",
                                  isSubActive
                                    ? "bg-white text-gray-900 shadow-[0_8px_18px_rgba(0,0,0,0.05)]"
                                    : "text-gray-500 hover:bg-white/70 hover:text-gray-900",
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

        <div className="space-y-2.5 border-t border-[#e6d7c8] p-4">
          <button
            onClick={handleLogout}
            disabled={isSigningOut}
            className="flex min-h-[54px] w-full items-center gap-3.5 rounded-[1.4rem] px-4 py-3 text-base font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-[1.4rem] w-[1.4rem] opacity-75" />
            <span>{isSigningOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}</span>
          </button>

          <Link
            href={STORE_RUNTIME.storefrontUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[54px] items-center gap-3.5 rounded-[1.4rem] px-4 py-3 text-base font-medium text-gray-600 transition-colors hover:bg-white/70 hover:text-gray-900"
          >
            <Store className="h-[1.4rem] w-[1.4rem] opacity-75" />
            <span>Siteye Dön</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
