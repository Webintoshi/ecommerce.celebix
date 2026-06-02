"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Instagram, Youtube } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import type { PolicyFooterLink } from "@/lib/policy-pages";
import {
  type StorefrontLocale,
  buildLocalizedPath,
} from "@/lib/i18n";

type FooterCategory = {
  id: string;
  name: string;
  slug: string;
};

type FooterLocaleCopy = {
  languageLabel: string;
  aboutHeading: string;
  categoriesHeading: string;
  policiesHeading: string;
  aboutLinks: Array<{ name: string; href: string }>;
  policyLinks: Array<{ name: string; href: string }>;
  rights: string;
  partnerLabel: string;
};

const LOCALE_SWITCH_OPTIONS: Array<{
  locale: StorefrontLocale;
  label: string;
  flag: string;
}> = [
  { locale: "tr", label: "Türkçe", flag: "🇹🇷" },
  { locale: "en", label: "English", flag: "🇬🇧" },
  { locale: "de", label: "Deutsch", flag: "🇩🇪" },
  { locale: "ru", label: "Русский", flag: "🇷🇺" },
  { locale: "ar", label: "العربية", flag: "🇸🇦" },
  { locale: "ka", label: "ქართული", flag: "🇬🇪" },
];

const FOOTER_COPY: Record<StorefrontLocale, FooterLocaleCopy> = {
  tr: {
    languageLabel: "Dil",
    aboutHeading: "Bizi Tanıyın",
    categoriesHeading: "Kategoriler",
    policiesHeading: "Politikalar",
    aboutLinks: [
      { name: "Ana Sayfa", href: "/" },
      { name: "Hakkımızda", href: "/hakkimizda" },
      { name: "Mağazalarımız", href: "/magazalarimiz" },
      { name: "Kurumsal Ürünler", href: "/kurumsal-urunler" },
      { name: "İletişim", href: "/iletisim" },
    ],
    policyLinks: [
      { name: "Mesafeli Satış Sözleşmesi", href: "/mesafeli-satis-sozlesmesi" },
      { name: "Teslimat ve İade Politikası", href: "/iade" },
      { name: "Gizlilik Politikası", href: "/gizlilik" },
      { name: "KVKK", href: "/kvkk" },
    ],
    rights: "Tüm hakları saklıdır.",
    partnerLabel: "Dijital Çözüm Ortağı",
  },
  en: {
    languageLabel: "Language",
    aboutHeading: "Discover Us",
    categoriesHeading: "Categories",
    policiesHeading: "Policies",
    aboutLinks: [
      { name: "Home", href: "/" },
      { name: "About", href: "/hakkimizda" },
      { name: "Stores", href: "/magazalarimiz" },
      { name: "Corporate Products", href: "/kurumsal-urunler" },
      { name: "Contact", href: "/iletisim" },
    ],
    policyLinks: [
      { name: "Distance Sales Agreement", href: "/mesafeli-satis-sozlesmesi" },
      { name: "Delivery and Returns", href: "/iade" },
      { name: "Privacy Policy", href: "/gizlilik" },
      { name: "Data Privacy", href: "/kvkk" },
    ],
    rights: "All rights reserved.",
    partnerLabel: "Digital Growth Partner",
  },
  de: {
    languageLabel: "Sprache",
    aboutHeading: "Über Uns",
    categoriesHeading: "Kategorien",
    policiesHeading: "Richtlinien",
    aboutLinks: [
      { name: "Startseite", href: "/" },
      { name: "Über uns", href: "/hakkimizda" },
      { name: "Geschäfte", href: "/magazalarimiz" },
      { name: "Firmenprodukte", href: "/kurumsal-urunler" },
      { name: "Kontakt", href: "/iletisim" },
    ],
    policyLinks: [
      { name: "Fernabsatzvertrag", href: "/mesafeli-satis-sozlesmesi" },
      { name: "Lieferung und Rückgabe", href: "/iade" },
      { name: "Datenschutz", href: "/gizlilik" },
      { name: "Datenschutzrecht", href: "/kvkk" },
    ],
    rights: "Alle Rechte vorbehalten.",
    partnerLabel: "Digitaler Lösungspartner",
  },
  ru: {
    languageLabel: "Язык",
    aboutHeading: "О Нас",
    categoriesHeading: "Категории",
    policiesHeading: "Политики",
    aboutLinks: [
      { name: "Главная", href: "/" },
      { name: "О нас", href: "/hakkimizda" },
      { name: "Магазины", href: "/magazalarimiz" },
      { name: "Корпоративные товары", href: "/kurumsal-urunler" },
      { name: "Контакты", href: "/iletisim" },
    ],
    policyLinks: [
      { name: "Договор дистанционной продажи", href: "/mesafeli-satis-sozlesmesi" },
      { name: "Доставка и возврат", href: "/iade" },
      { name: "Политика конфиденциальности", href: "/gizlilik" },
      { name: "Защита данных", href: "/kvkk" },
    ],
    rights: "Все права защищены.",
    partnerLabel: "Цифровой партнер",
  },
  ar: {
    languageLabel: "اللغة",
    aboutHeading: "اعرفنا",
    categoriesHeading: "الفئات",
    policiesHeading: "السياسات",
    aboutLinks: [
      { name: "الرئيسية", href: "/" },
      { name: "من نحن", href: "/hakkimizda" },
      { name: "متاجرنا", href: "/magazalarimiz" },
      { name: "المنتجات المؤسسية", href: "/kurumsal-urunler" },
      { name: "اتصل بنا", href: "/iletisim" },
    ],
    policyLinks: [
      { name: "اتفاقية البيع عن بعد", href: "/mesafeli-satis-sozlesmesi" },
      { name: "الشحن والاسترجاع", href: "/iade" },
      { name: "سياسة الخصوصية", href: "/gizlilik" },
      { name: "خصوصية البيانات", href: "/kvkk" },
    ],
    rights: "جميع الحقوق محفوظة.",
    partnerLabel: "شريك النمو الرقمي",
  },
  ka: {
    languageLabel: "ენა",
    aboutHeading: "ჩვენ შესახებ",
    categoriesHeading: "კატეგორიები",
    policiesHeading: "პოლიტიკები",
    aboutLinks: [
      { name: "მთავარი", href: "/" },
      { name: "ჩვენ შესახებ", href: "/hakkimizda" },
      { name: "მაღაზიები", href: "/magazalarimiz" },
      { name: "კორპორატიული პროდუქტები", href: "/kurumsal-urunler" },
      { name: "კონტაქტი", href: "/iletisim" },
    ],
    policyLinks: [
      { name: "დისტანციური გაყიდვის შეთანხმება", href: "/mesafeli-satis-sozlesmesi" },
      { name: "მიწოდება და დაბრუნება", href: "/iade" },
      { name: "კონფიდენციალურობის პოლიტიკა", href: "/gizlilik" },
      { name: "მონაცემთა დაცვა", href: "/kvkk" },
    ],
    rights: "ყველა უფლება დაცულია.",
    partnerLabel: "ციფრული პარტნიორი",
  },
};

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const [categoryLinks, setCategoryLinks] = useState<FooterCategory[]>([]);
  const [policyLinks, setPolicyLinks] = useState<PolicyFooterLink[]>([]);
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false);
  const { locale, internalPathname } = useStorefrontRoute();
  const localeMenuRef = useRef<HTMLDivElement | null>(null);
  const currentYear = new Date().getFullYear();
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);
  const copy = FOOTER_COPY.en;
  const activeLocaleOption =
    LOCALE_SWITCH_OPTIONS.find((option) => option.locale === locale) ?? LOCALE_SWITCH_OPTIONS[0];

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const [categories, policyResponse] = await Promise.all([
          fetchCategories(locale),
          fetch(`/api/policies?locale=${encodeURIComponent(locale)}`, {
            cache: "no-store",
          }),
        ]);
        if (!isMounted) {
          return;
        }

        const topLevelCategories = categories
          .filter((category) => !category.parent_id && category.is_active !== false && category.slug)
          .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0))
          .map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
          }));

        setCategoryLinks(topLevelCategories);
        if (policyResponse.ok) {
          const payload = (await policyResponse.json()) as {
            pages?: PolicyFooterLink[];
          };
          setPolicyLinks(Array.isArray(payload.pages) ? payload.pages : []);
        } else {
          setPolicyLinks([]);
        }
      } catch (error) {
        console.error("Failed to load footer categories:", error);
        setPolicyLinks([]);
      }
    };

    void loadCategories();

    return () => {
      isMounted = false;
    };
  }, [locale]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!localeMenuRef.current?.contains(event.target as Node)) {
        setIsLocaleMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <footer className="bg-[#0B1120] text-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="lg:col-span-1">
            <Link href={buildLocalizedPath("/", locale)} className="mb-6 inline-block">
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

            <div className="mb-6 space-y-2">
              <p className="text-sm text-gray-300">+90 (507) 559-7228</p>
              <p className="text-sm text-gray-300">bilgi@derycraft.com</p>
            </div>

            <div className="mb-6">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B8C0D9]">
                {copy.languageLabel}
              </p>
              <div ref={localeMenuRef} className="relative w-fit">
                <button
                  type="button"
                  onClick={() => setIsLocaleMenuOpen((current) => !current)}
                  className="flex min-w-[150px] items-center justify-between gap-3 rounded-sm border border-dashed border-white/70 bg-white px-3 py-3 text-left text-[#0B1120] transition hover:border-white"
                  aria-expanded={isLocaleMenuOpen}
                  aria-haspopup="listbox"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base leading-none">{activeLocaleOption.flag}</span>
                    <span className="text-base font-medium">{activeLocaleOption.label}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-[#4A4A4A] transition-transform ${isLocaleMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isLocaleMenuOpen ? (
                  <div className="absolute left-0 top-full z-20 mt-2 min-w-[190px] overflow-hidden rounded-xl border border-white/10 bg-[#11192D] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                    <div className="space-y-1">
                      {LOCALE_SWITCH_OPTIONS.map((option) => {
                        const isActive = option.locale === locale;
                        return (
                          <Link
                            key={option.locale}
                            href={buildLocalizedPath(internalPathname, option.locale)}
                            hrefLang={option.locale}
                            onClick={() => setIsLocaleMenuOpen(false)}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 transition ${
                              isActive
                                ? "bg-white text-[#0B1120]"
                                : "text-white/88 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="text-base leading-none">{option.flag}</span>
                              <span className="text-sm font-medium">{option.label}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
            <p
              className="mb-5 text-sm font-semibold uppercase tracking-wider !text-white"
              style={{ color: "#FFFFFF", fontFamily: "var(--store-font-body)" }}
            >
              {copy.aboutHeading}
            </p>
            <ul className="space-y-3">
              {copy.aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={buildLocalizedPath(link.href, locale)}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p
              className="mb-5 text-sm font-semibold uppercase tracking-wider !text-white"
              style={{ color: "#FFFFFF", fontFamily: "var(--store-font-body)" }}
            >
              {copy.categoriesHeading}
            </p>
            <ul className="space-y-3">
              {categoryLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    href={buildLocalizedPath(`/${link.slug}`, locale)}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {link.name.toUpperCase()}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {policyLinks.length > 0 ? (
          <div>
            <p
              className="mb-5 text-sm font-semibold uppercase tracking-wider !text-white"
              style={{ color: "#FFFFFF", fontFamily: "var(--store-font-body)" }}
            >
              {copy.policiesHeading}
            </p>
            <ul className="space-y-3">
              {policyLinks.map((link) => (
                <li key={link.slug}>
                  <Link
                    href={buildLocalizedPath(link.href, locale)}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-gray-800">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 lg:flex-row lg:px-8">
          <p className="text-xs text-gray-500">
            © {currentYear} {storeInfo?.name || SITE_NAME}. {copy.rights}
          </p>
          <a
            href="https://celebix.co"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 text-gray-400 transition-colors hover:text-white"
          >
            <span className="text-[10px] uppercase tracking-[0.2em]">{copy.partnerLabel}</span>
            <img
              src="https://celebix.co/Logo/koyu%20logo.svg"
              alt="Celebix"
              className="h-6 w-auto brightness-0 invert"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
