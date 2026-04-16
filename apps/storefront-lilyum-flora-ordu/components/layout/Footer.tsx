"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Instagram, Mail, Phone, Youtube } from "lucide-react";
import { SITE_NAME, SOCIAL_LINKS } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import type { PolicyFooterLink } from "@/lib/policy-pages";
import {
  type StorefrontLocale,
  buildLocalizedPath,
  getLocalizedCopy,
} from "@/lib/i18n";
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
          .slice(0, 6)
          .map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
          }));

        setCategoryLinks(topLevelCategories);
        if (policyResponse.ok) {
          const payload = (await policyResponse.json()) as { pages?: PolicyFooterLink[] };
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
    { name: copy.footerContact, href: "/iletisim" },
    { name: "Tüm Ürünler", href: "/urunler" },
    { name: "SSS", href: "/sss" },
  ];

  return (
    <footer className="border-t border-[var(--store-border)] bg-[var(--store-ink)] text-white">
      <div className="container-premium py-14 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] lg:gap-8">
          <div className="space-y-6">
            <div>
              <Link href={buildLocalizedPath("/", locale)} className="inline-block">
                {logoSrc ? (
                  <div className="relative h-10 w-[156px]">
                    <Image
                      src={logoSrc}
                      alt={logoAlt}
                      fill
                      className="object-contain object-left brightness-0 invert"
                      sizes="156px"
                      unoptimized={usesProxiedLogo}
                    />
                  </div>
                ) : (
                  <p className="font-[var(--font-display)] text-3xl font-semibold tracking-[-0.05em] text-white">
                    {logoAlt}
                  </p>
                )}
              </Link>
            </div>

            <div className="grid gap-3 text-sm text-white/78">
              <a href={`tel:${contactPhone}`} className="inline-flex items-center gap-2 hover:text-white">
                <Phone className="h-4 w-4 text-[var(--store-blush)]" />
                {contactPhone}
              </a>
              <a href={`mailto:${contactEmail}`} className="inline-flex items-center gap-2 hover:text-white">
                <Mail className="h-4 w-4 text-[var(--store-blush)]" />
                {contactEmail}
              </a>
            </div>

            <div className="flex items-center gap-3">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/6 text-white/78 transition hover:border-white/28 hover:bg-white/10 hover:text-white"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/6 text-white/78 transition hover:border-white/28 hover:bg-white/10 hover:text-white"
                aria-label="YouTube"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--store-blush)]">
              {copy.aboutHeading}
            </p>
            <ul className="mt-5 space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={buildLocalizedPath(link.href, locale)}
                    className="text-sm text-white/72 transition hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--store-blush)]">
              {copy.categoriesHeading}
            </p>
            <ul className="mt-5 space-y-3">
              {categoryLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    href={buildLocalizedPath(`/${link.slug}`, locale)}
                    className="text-sm text-white/72 transition hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-8">
            {policyLinks.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--store-blush)]">
                  {copy.policiesHeading}
                </p>
                <ul className="mt-5 space-y-3">
                  {policyLinks.map((link) => (
                    <li key={link.slug}>
                      <Link
                        href={buildLocalizedPath(link.href, locale)}
                        className="text-sm text-white/72 transition hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--store-blush)]">
                Dil
              </p>
              <div ref={localeMenuRef} className="relative mt-4 w-fit">
                <button
                  type="button"
                  onClick={() => setIsLocaleMenuOpen((current) => !current)}
                  className="flex min-w-[132px] items-center justify-between gap-3 rounded-full border border-white/14 bg-white/8 px-4 py-3 text-left text-white transition hover:border-white/28"
                  aria-expanded={isLocaleMenuOpen}
                  aria-haspopup="listbox"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {LOCALE_SWITCH_OPTIONS.find((option) => option.locale === locale)?.label || "TR"}
                    </span>
                    <span className="text-xs uppercase text-white/72">{locale}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${isLocaleMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isLocaleMenuOpen ? (
                  <div className="absolute left-0 top-full z-20 mt-2 min-w-[170px] overflow-hidden rounded-[24px] border border-white/12 bg-[#445163] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.3)]">
                    <div className="space-y-1">
                      {LOCALE_SWITCH_OPTIONS.map((option) => {
                        const isActive = option.locale === locale;
                        return (
                          <Link
                            key={option.locale}
                            href={buildLocalizedPath(internalPathname, option.locale)}
                            hrefLang={option.locale}
                            onClick={() => setIsLocaleMenuOpen(false)}
                            className={`flex items-center justify-between rounded-[18px] px-3 py-2 transition ${
                              isActive
                                ? "bg-white text-[var(--store-ink)]"
                                : "text-white/82 hover:bg-white/10 hover:text-white"
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
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-premium flex flex-col items-center justify-between gap-3 py-5 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-white/55">
            &copy; {currentYear} {storeInfo?.name || SITE_NAME}. {copy.footerRights}
          </p>
          <a
            href="https://celebix.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-[0.2em] text-white/45 transition hover:text-white/72"
          >
            Powered by Celebix
          </a>
        </div>
      </div>
    </footer>
  );
}
