"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  Home,
  Package,
  Tag,
  Users,
  Percent,
  FileText,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  LogOut,
  Settings,
  Store,
  Megaphone as MarketingIcon,
  Search,
  Users as AdminsIcon,
  Calculator,
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
      { title: "Kod Entegrasyonlari", href: "/admin/seo-killer/kod-entegrasyonlari" },
      { title: "Hızlı İndeks", href: "/admin/seo-killer/hizli-index" },
    ],
  },
  { title: "Marketplace", icon: Store, href: "/admin/markets" },
  { title: "Yöneticiler", icon: AdminsIcon, href: "/admin/yoneticiler" },
  {
    title: "Ayarlar",
    icon: Settings,
    href: "/admin/ayarlar",
  },
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [resolvedProfile, setResolvedProfile] = useState<InitialAdminProfile | null>(initialProfile);
  const [isRecoveringProfile, setIsRecoveringProfile] = useState(false);
  const [hasAttemptedProfileRecovery, setHasAttemptedProfileRecovery] = useState(Boolean(initialProfile?.role));
  const userEmail = resolvedProfile?.email;
  const userName = resolvedProfile?.fullName || userEmail?.split("@")[0] || "Admin Kullanici";
  const role: UserRole | null = resolvedProfile?.role || null;

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
    setIsMobileMenuOpen(isOpen);
  }, [isOpen]);

  useEffect(() => {
    const autoExpand = MENU_ITEMS.filter((item) => item.submenu?.some((sub) => sub.href === pathname)).map(
      (item) => item.title,
    );
    if (autoExpand.length === 0) return;

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
      if (!hasPermission(role, item.href)) return false;
      if (item.permission && !hasActionPermission(role, item.permission)) return false;
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

  const handleLinkClick = () => {
    if (isMobile && onClose) {
      onClose();
    }
  };

  return (
    <>
      {isMobile && isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />}

      <aside
        className={cn(
          "bg-[#eee5dc] border-l border-[#e6d7c8] flex flex-col fixed md:sticky top-0 h-screen z-50 transition-transform duration-300",
          isMobile
            ? `${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"} w-[min(24rem,94vw)] right-0 left-auto`
            : "w-56 shrink-0 xl:w-[15rem] 2xl:w-64",
        )}
      >
        <div className="flex items-center gap-3.5 border-b border-[#e6d7c8] p-4 xl:px-4.5 2xl:px-5">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[20px] bg-white shadow-sm ring-1 ring-black/5">
            <Image
              src={ADMIN_BRAND_LOGO_SRC}
              alt="Celebi X"
              width={40}
              height={40}
              className="h-full w-full object-contain p-1.5"
              priority
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block break-words text-[15px] font-semibold leading-snug text-gray-900">
              {STORE_RUNTIME.name} Admin
            </span>
            <span className="block truncate text-[13px] font-medium text-gray-500">
              {userName || userEmail || "Admin Kullanıcı"}
            </span>
          </div>
        </div>

        {!role && !isRecoveringProfile ? (
          <div className="mx-4 mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] font-medium leading-5 text-amber-800">
            Yetki bilgisi yuklenemedi. Menuler sinirli gosteriliyor.
          </div>
        ) : null}

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 py-3.5">
          {filteredItems.map((item) => {
            const hasSubmenu = Boolean(item.submenu?.length);
            const isActive =
              pathname === item.href ||
              (!hasSubmenu && item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            const isExpanded = expandedMenus.includes(item.title);
            const isSubmenuActive = item.submenu?.some((sub) => pathname === sub.href);

            return (
              <div key={item.title}>
                <div
                  className={cn(
                    "group flex items-center justify-between rounded-[1.35rem] px-3.5 py-3 cursor-pointer select-none text-[15px] font-medium transition-colors",
                    isActive || isSubmenuActive
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/50 hover:text-gray-900",
                  )}
                  onClick={() => {
                    if (hasSubmenu) {
                      toggleMenu(item.title);
                    }
                  }}
                >
                    <Link href={item.href} onClick={handleLinkClick} className="flex min-w-0 flex-1 items-center gap-3.5">
                      <item.icon className="h-[1.35rem] w-[1.35rem] opacity-75" />
                      <span className="min-w-0 truncate leading-snug">{item.title}</span>
                    </Link>

                  <div className="flex items-center gap-2">
                    {item.badge ? (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {item.badge}
                      </span>
                    ) : null}
                    {hasSubmenu ? (
                      <div className="text-gray-400">
                        {isExpanded ? (
                          <ChevronDown className="h-[1.05rem] w-[1.05rem]" />
                        ) : (
                          <ChevronRight className="h-[1.05rem] w-[1.05rem]" />
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                {hasSubmenu && isExpanded && (
                  <div className="mt-1.5 ml-9 space-y-1">
                    {item.submenu?.map((sub) => {
                      const isSubActive = pathname === sub.href;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={handleLinkClick}
                          className={cn(
                            "block break-words rounded-[1rem] px-3.5 py-2.5 text-[14px] font-medium leading-5 transition-colors",
                            isSubActive
                              ? "text-gray-900 font-medium bg-gray-200/50"
                              : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/30",
                          )}
                        >
                          {sub.title}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="space-y-2.5 border-t border-[#e6d7c8] p-4">
          <button
            onClick={handleLogout}
            disabled={isSigningOut}
            className="flex min-h-[48px] w-full items-center gap-3.5 rounded-[1.25rem] px-3.5 py-3 text-[15px] font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-[1.35rem] w-[1.35rem] opacity-75" />
            <span>{isSigningOut ? "Cikis Yapiliyor..." : "Çıkış Yap"}</span>
          </button>
          <Link
            href={STORE_RUNTIME.storefrontUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[48px] items-center gap-3.5 rounded-[1.25rem] px-3.5 py-3 text-[15px] font-medium text-gray-600 transition-colors hover:bg-gray-200/50 hover:text-gray-900"
          >
            <Store className="h-[1.35rem] w-[1.35rem] opacity-75" />
            <span>Siteye Dön</span>
          </Link>
        </div>
      </aside>
    </>
  );
}

