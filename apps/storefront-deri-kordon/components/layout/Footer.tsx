"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Instagram, Youtube } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import {
  DEFAULT_LOCALE,
  type StorefrontLocale,
  buildLocalizedPath,
  getLocaleFromPathname,
  stripLocaleFromPathname,
} from "@/lib/i18n";

type FooterCategory = {
  id: string;
  name: string;
  slug: string;
};

const LOCALE_SWITCH_OPTIONS: Array<{
  locale: StorefrontLocale;
  shortLabel: string;
  label: string;
  flag: string;
}> = [
  { locale: "tr", shortLabel: "TR", label: "Turkce", flag: "🇹🇷" },
  { locale: "en", shortLabel: "EN", label: "English", flag: "🇬🇧" },
  { locale: "de", shortLabel: "DE", label: "Deutsch", flag: "🇩🇪" },
  { locale: "ru", shortLabel: "RU", label: "Russkiy", flag: "🇷🇺" },
  { locale: "ar", shortLabel: "AR", label: "Arabic", flag: "🇸🇦" },
  { locale: "ka", shortLabel: "KA", label: "Kartuli", flag: "🇬🇪" },
];

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const [categoryLinks, setCategoryLinks] = useState<FooterCategory[]>([]);
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);
  const locale = getLocaleFromPathname(pathname) || DEFAULT_LOCALE;
  const currentPath = stripLocaleFromPathname(pathname || "/");

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const categories = await fetchCategories();
        if (!isMounted) return;

        const topLevelCategories = categories
          .filter((category) => !category.parent_id && category.is_active !== false && category.slug)
          .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0))
          .map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
          }));

        setCategoryLinks(topLevelCategories);
      } catch (error) {
        console.error("Failed to load footer categories:", error);
      }
    };

    void loadCategories();

    return () => {
      isMounted = false;
    };
  }, []);

  const aboutLinks = [
    { name: "Ana Sayfa", href: "/" },
    { name: "Hakkımızda", href: "/hakkimizda" },
    { name: "Mağazalarımız", href: "/magazalarimiz" },
    { name: "Kurumsal Sipariş", href: "/kurumsal-urunler" },
    { name: "İletişim", href: "/iletisim" },
  ];

  const policyLinks = [
    { name: "Mesafeli Satış Sözleşmesi", href: "/mesafeli-satis-sozlesmesi" },
    { name: "Teslimat & İade Politikası", href: "/iade" },
    { name: "Gizlilik Politikası", href: "/gizlilik" },
    { name: "KVKK", href: "/kvkk" },
  ];

  return (
    <footer className="bg-[#0B1120] text-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="lg:col-span-1">
            <Link href="/" className="mb-6 inline-block">
              {logoSrc ? (
                <div className="relative h-10 w-[150px]">
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    fill
                    className="object-contain object-left brightness-0 invert"
                    sizes="150px"
                    unoptimized={usesProxiedLogo}
                  />
                </div>
              ) : (
                <span
                  className="text-2xl font-light tracking-wide"
                  style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}
                >
                  DeryCraft
                </span>
              )}
            </Link>

            {/* Language Selector */}
            <div className="mb-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                Language
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/"
                  className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800/50 p-3 transition-all hover:border-gray-500"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 text-xs font-bold text-gray-300">
                    TR
                  </span>
                  <div>
                    <p className="text-xs text-gray-400">TR</p>
                    <p className="text-sm font-medium text-white">Türkçe</p>
                  </div>
                  <div className="ml-auto flex h-4 w-4 items-center justify-center rounded-full border border-white bg-white">
                    <div className="h-2 w-2 rounded-full bg-neutral-900"></div>
                  </div>
                </Link>
                <Link
                  href="/en"
                  className="flex items-center gap-3 rounded-xl border border-gray-700 bg-transparent p-3 transition-all hover:border-gray-500 hover:bg-gray-800/30"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-600 text-xs font-bold text-gray-400">
                    EN
                  </span>
                  <div>
                    <p className="text-xs text-gray-500">GB</p>
                    <p className="text-sm font-medium text-gray-300">English</p>
                  </div>
                  <div className="ml-auto flex h-4 w-4 items-center justify-center rounded-full border border-gray-600"></div>
                </Link>
              </div>
            </div>

            <div className="mb-6 space-y-2">
              <p className="text-sm text-gray-300">+90 (507) 559-7228</p>
              <p className="text-sm text-gray-300">bilgi@derycraft.com</p>
            </div>

            <div className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.18)] backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B8C0D9]">
                    Language
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Choose your storefront language</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                  {locale.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {LOCALE_SWITCH_OPTIONS.map((option) => {
                  const isActive = option.locale === locale;

                  return (
                    <Link
                      key={option.locale}
                      href={buildLocalizedPath(currentPath, option.locale)}
                      hrefLang={option.locale}
                      className={`group rounded-2xl border px-3 py-3 transition-all ${
                        isActive
                          ? "border-white bg-white text-[#0B1120] shadow-[0_16px_40px_rgba(255,255,255,0.12)]"
                          : "border-white/10 bg-white/[0.03] text-white/88 hover:border-white/25 hover:bg-white/[0.08]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none">{option.flag}</span>
                          <span
                            className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                              isActive ? "text-[#6A728B]" : "text-[#A7B0C9]"
                            }`}
                          >
                            {option.shortLabel}
                          </span>
                        </div>
                        {isActive ? (
                          <span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-[#0B1120]" />
                        ) : (
                          <span className="mt-0.5 h-2.5 w-2.5 rounded-full border border-white/20 transition-colors group-hover:border-white/40" />
                        )}
                      </div>
                      <p
                        className={`mt-3 text-sm font-medium ${
                          isActive ? "text-[#0B1120]" : "text-white/92"
                        }`}
                      >
                        {option.label}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="https://www.instagram.com/dery.craft"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-600 text-gray-400 transition-all hover:border-white hover:text-white"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="https://www.youtube.com/@DeryCraft_Handmade"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-600 text-gray-400 transition-all hover:border-white hover:text-white"
                aria-label="YouTube"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-white">
              BİZİ TANIYIN
            </h3>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-white">
              KATEGORİLER
            </h3>
            <ul className="space-y-3">
              {categoryLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    href={`/${link.slug}`}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {link.name.toUpperCase()}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-white">
              POLİTİKALAR
            </h3>
            <ul className="space-y-3">
              {policyLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800">
        <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-xs text-gray-500">
              © {currentYear} {storeInfo?.name || SITE_NAME}. Tüm hakları saklıdır.
            </p>
            <a
              href="https://celebix.co"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 text-gray-400 transition-colors hover:text-white"
            >
              <span className="text-[10px] tracking-[0.2em] uppercase">Dijital Çözüm Ortağı</span>
              <img
                src="https://celebix.co/Logo/koyu%20logo.svg"
                alt="Celebix"
                className="h-6 w-auto brightness-0 invert"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
