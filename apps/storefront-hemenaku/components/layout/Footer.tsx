"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Instagram, Youtube } from "lucide-react";
import { SITE_NAME, SOCIAL_LINKS } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { DEFAULT_DEMO_CATEGORIES } from "@/lib/default-demo-theme";
import type { PolicyFooterLink } from "@/lib/policy-pages";
import {
  LOCALE_LABELS,
  getLocalizedCopy,
} from "@/lib/i18n";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

type FooterCategory = {
  id: string;
  name: string;
  slug: string;
};

type FooterVisibleCategory = FooterCategory & {
  href?: string;
};

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const [categoryLinks, setCategoryLinks] = useState<FooterCategory[]>([]);
  const [policyLinks, setPolicyLinks] = useState<PolicyFooterLink[]>([]);
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false);
  const { locale, internalPathname, routing, buildPath } = useStorefrontRoute();
  const localeMenuRef = useRef<HTMLDivElement | null>(null);
  const currentYear = new Date().getFullYear();
  const copy = useMemo(() => getLocalizedCopy(locale), [locale]);
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);
  const localeSwitchOptions = routing.availableLocales.map((entryLocale) => ({
    locale: entryLocale,
    label: LOCALE_LABELS[entryLocale],
  }));
  const activeLocaleOption =
    localeSwitchOptions.find((option) => option.locale === locale) ?? localeSwitchOptions[0];

  const contactEmail = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const contactPhone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const instagramUrl = storeInfo?.socialInstagram || "";
  const youtubeUrl = "";
  const visibleCategoryLinks: FooterVisibleCategory[] =
    categoryLinks.length > 0
      ? categoryLinks
      : DEFAULT_DEMO_CATEGORIES.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          href: category.href,
        }));

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

  const aboutLinks = [
    { name: copy.footerHome, href: "/" },
    { name: copy.footerAbout, href: "/hakkimizda" },
    { name: "Tüm Ürünler", href: "/urunler" },
    { name: "Kargo ve Teslimat", href: "/kargo" },
    { name: copy.footerContact, href: "/iletisim" },
  ];

  return (
    <footer className="bg-[#08111F] text-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="lg:col-span-1">
            <Link href={buildPath("/")} className="mb-6 inline-block">
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
                <span className="text-2xl font-semibold tracking-tight">{logoAlt}</span>
              )}
            </Link>

            <div className="mb-6 space-y-2">
              <p className="text-sm text-gray-300">{contactPhone}</p>
              <p className="break-all text-sm text-gray-300">{contactEmail}</p>
              <p className="max-w-xs text-sm leading-6 text-gray-400">
                Akü, oto elektrik ve araç enerji ürünlerinde doğru seçim, kolay sipariş ve hızlı destek için Hemenaku.
              </p>
            </div>

            {routing.showLocaleSwitcher ? (
            <div className="mb-6">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B8C0D9]">
                Language
              </p>
              <div ref={localeMenuRef} className="relative w-fit">
                <button
                  type="button"
                  onClick={() => setIsLocaleMenuOpen((current) => !current)}
                  className="flex min-w-[132px] items-center justify-between gap-3 rounded-sm border border-dashed border-white/70 bg-white px-3 py-3 text-left text-[#0B1120] transition hover:border-white"
                  aria-expanded={isLocaleMenuOpen}
                  aria-haspopup="listbox"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{activeLocaleOption.label}</span>
                    <span className="text-sm">{locale.toUpperCase()}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-[#4A4A4A] transition-transform ${isLocaleMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isLocaleMenuOpen ? (
                  <div className="absolute left-0 top-full z-20 mt-2 min-w-[170px] overflow-hidden rounded-xl border border-white/10 bg-[#11192D] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                    <div className="space-y-1">
                      {localeSwitchOptions.map((option) => {
                        const isActive = option.locale === locale;
                        return (
                          <Link
                            key={option.locale}
                            href={buildPath(internalPathname, option.locale)}
                            hrefLang={option.locale}
                            onClick={() => setIsLocaleMenuOpen(false)}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 transition ${
                              isActive
                                ? "bg-white text-[#0B1120]"
                                : "text-white/88 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <span className="text-sm font-medium">{option.label}</span>
                            <span className="text-xs uppercase">{option.locale}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            ) : null}

            {instagramUrl || youtubeUrl ? (
            <div className="flex items-center gap-3">
              {instagramUrl ? (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-gray-400 transition-all hover:border-white hover:text-white"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              ) : null}
              {youtubeUrl ? (
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-gray-400 transition-all hover:border-white hover:text-white"
                aria-label="YouTube"
              >
                <Youtube className="h-4 w-4" />
              </a>
              ) : null}
            </div>
            ) : null}
          </div>

          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-wider text-white">
              {copy.aboutHeading}
            </p>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={buildPath(link.href)}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-wider text-white">
              {copy.categoriesHeading}
            </p>
            <ul className="space-y-3">
              {visibleCategoryLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    href={buildPath(link.href || `/${link.slug}`)}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {policyLinks.length > 0 ? (
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-wider text-white">
              {copy.policiesHeading}
            </p>
            <ul className="space-y-3">
              {policyLinks.map((link) => (
                <li key={link.slug}>
                  <Link
                    href={buildPath(link.href)}
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

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 lg:flex-row lg:px-8">
          <p className="text-xs text-gray-500">
            &copy; {currentYear} {storeInfo?.name || SITE_NAME}. {copy.footerRights}
          </p>
        </div>
      </div>
    </footer>
  );
}
