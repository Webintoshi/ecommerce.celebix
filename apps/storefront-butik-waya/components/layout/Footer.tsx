"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Instagram, Youtube } from "lucide-react";
import { SITE_NAME, SOCIAL_LINKS } from "@/lib/constants";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import type { PolicyFooterLink } from "@/lib/policy-pages";
import {
  type StorefrontLocale,
  buildLocalizedPath,
  getLocalizedCopy,
} from "@/lib/i18n";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

type FooterCategory = {
  id: string;
  name: string;
  slug: string;
};

const LOCALE_SWITCH_OPTIONS: Array<{
  locale: StorefrontLocale;
  label: string;
}> = [
  { locale: "tr", label: "TR" },
  { locale: "en", label: "EN" },
  { locale: "de", label: "DE" },
  { locale: "ru", label: "RU" },
  { locale: "ar", label: "AR" },
  { locale: "ka", label: "KA" },
];

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const [categoryLinks, setCategoryLinks] = useState<FooterCategory[]>([]);
  const [policyLinks, setPolicyLinks] = useState<PolicyFooterLink[]>([]);
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false);
  const { locale, internalPathname } = useStorefrontRoute();
  const localeMenuRef = useRef<HTMLDivElement | null>(null);
  const currentYear = new Date().getFullYear();
  const copy = useMemo(() => getLocalizedCopy(locale), [locale]);
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);
  const activeLocaleOption =
    LOCALE_SWITCH_OPTIONS.find((option) => option.locale === locale) ?? LOCALE_SWITCH_OPTIONS[0];

  const contactEmail = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const contactPhone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const instagramUrl = storeInfo?.socialInstagram || SOCIAL_LINKS.instagram;
  const youtubeUrl = SOCIAL_LINKS.youtube || SOCIAL_LINKS.instagram;

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
    { name: copy.footerStores, href: "/magazalarimiz" },
    { name: copy.footerCorporate, href: "/kurumsal-urunler" },
    { name: copy.footerContact, href: "/iletisim" },
  ];

  return (
    <footer className="mt-24 bg-[#151515] text-[#F5F1EB]">
      <div className="container-premium py-14 lg:py-16">
        <div
          className={`grid gap-12 border-b border-white/10 pb-12 ${
            policyLinks.length > 0
              ? "lg:grid-cols-[1.25fr_0.72fr_0.72fr_0.9fr]"
              : "lg:grid-cols-[1.35fr_0.8fr_0.8fr]"
          }`}
        >
          <div>
            <Link href={buildLocalizedPath("/", locale)} className="inline-block">
              {logoSrc ? (
                <div className="relative h-10 w-[158px]">
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    fill
                    className="object-contain object-left brightness-0 invert"
                    sizes="158px"
                    unoptimized={usesProxiedLogo}
                  />
                </div>
              ) : (
                <span className="font-serif text-3xl tracking-[-0.04em] text-[#F5F1EB]">
                  {logoAlt}
                </span>
              )}
            </Link>

            <p className="mt-6 max-w-md text-sm leading-7 text-white/62">
              Butik Waya, sakin luksu gunluk gardiroba tasiyan secili bir storefront duzeniyle
              yeni sezonun net, rafine ve kolay kombinlenen parcalarini bir araya getirir.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/42">Concierge</p>
                <p className="mt-3 text-base font-medium text-white">{contactPhone}</p>
                <p className="mt-1 break-all text-sm text-white/58">{contactEmail}</p>
              </div>

              <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/42">Dil secimi</p>
                <div ref={localeMenuRef} className="relative mt-3 w-full">
                  <button
                    type="button"
                    onClick={() => setIsLocaleMenuOpen((current) => !current)}
                    className="flex w-full items-center justify-between gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-white transition hover:border-white/22"
                    aria-expanded={isLocaleMenuOpen}
                    aria-haspopup="listbox"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{activeLocaleOption.label}</span>
                      <span className="text-sm text-white/58">{locale.toUpperCase()}</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-white/60 transition-transform ${
                        isLocaleMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isLocaleMenuOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-2 min-w-full overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#1C1C1C] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                      <div className="space-y-1">
                        {LOCALE_SWITCH_OPTIONS.map((option) => {
                          const isActive = option.locale === locale;
                          return (
                            <Link
                              key={option.locale}
                              href={buildLocalizedPath(internalPathname, option.locale)}
                              hrefLang={option.locale}
                              onClick={() => setIsLocaleMenuOpen(false)}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 transition ${
                                isActive
                                  ? "bg-white text-[#151515]"
                                  : "text-white/82 hover:bg-white/8 hover:text-white"
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
            </div>

            <div className="mt-6 flex items-center gap-3">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/60 transition-colors hover:border-white/28 hover:text-white"
                aria-label="İnstagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/60 transition-colors hover:border-white/28 hover:text-white"
                aria-label="YouTube"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/78">
              {copy.aboutHeading}
            </p>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={buildLocalizedPath(link.href, locale)}
                    className="text-sm text-white/58 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/78">
              {copy.categoriesHeading}
            </p>
            <ul className="space-y-3">
              {categoryLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    href={buildLocalizedPath(`/${link.slug}`, locale)}
                    className="text-sm text-white/58 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {policyLinks.length > 0 ? (
            <div>
              <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/78">
                {copy.policiesHeading}
              </p>
              <ul className="space-y-3">
                {policyLinks.map((link) => (
                  <li key={link.slug}>
                    <Link
                      href={buildLocalizedPath(link.href, locale)}
                      className="text-sm text-white/58 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-start justify-between gap-4 py-6 text-left lg:flex-row lg:items-center">
          <p className="text-xs text-white/38">
            &copy; {currentYear} {storeInfo?.name || SITE_NAME}. {copy.footerRights}
          </p>
          <a
            href="https://celebix.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white"
          >
            Powered by Celebix
          </a>
        </div>
      </div>
    </footer>
  );
}
