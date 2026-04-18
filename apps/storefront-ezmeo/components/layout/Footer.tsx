"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Instagram, Phone, Youtube } from "lucide-react";
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
    { name: "Blog", href: "/blog" },
    { name: "SSS", href: "/sss" },
    { name: copy.footerContact, href: "/iletisim" },
  ];
  const policyFallbackLinks: PolicyFooterLink[] = [
    { slug: "gizlilik", label: copy.footerPrivacy, href: "/gizlilik" },
    { slug: "kvkk", label: copy.footerKvkk, href: "/kvkk" },
    {
      slug: "mesafeli-satis-sozlesmesi",
      label: copy.footerDistanceSales,
      href: "/mesafeli-satis-sozlesmesi",
    },
    { slug: "iade", label: copy.footerReturns, href: "/iade" },
  ];
  const resolvedPolicyLinks = policyLinks.length > 0 ? policyLinks : policyFallbackLinks;

  return (
    <footer className="mt-20 bg-[var(--cocoa)] text-white">
      <div className="container-premium py-16 lg:py-20">
        <div className="mb-12 grid gap-8 border-b border-white/10 pb-12 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div className="max-w-3xl">
            <span className="editorial-kicker border-white/12 bg-white/6 text-white/72">
              Ezmeo pantry
            </span>
            <h2 className="mt-5 max-w-3xl text-4xl text-white sm:text-5xl">
              Rafine ama sicak bir ezme vitrini. Urun ne kadar iyiyse, sunum da o kadar sakin.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/68">
              Ezmeo; findik, fistik, badem ve benzeri premium ezmeleri daha iyi tipografi, daha net
              urun kadrajlari ve daha dusuk gurultu ile sunar.
            </p>
          </div>

          <div className="surface-card rounded-[2rem] bg-white/6 p-6 text-white backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">
              Iletisim
            </p>
            <div className="mt-4 space-y-3 text-sm text-white/78">
              <a href={`tel:${contactPhone}`} className="flex items-center gap-3 hover:text-white">
                <Phone className="h-4 w-4" />
                {contactPhone}
              </a>
              <a href={`mailto:${contactEmail}`} className="break-all hover:text-white">
                {contactEmail}
              </a>
            </div>
            <Link
              href={buildLocalizedPath("/iletisim", locale)}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/16"
            >
              Temasa gec
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-[1.2fr_0.9fr_0.9fr_1fr] lg:gap-8">
          <div>
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
                <span className="text-2xl font-light tracking-wide">{logoAlt}</span>
              )}
            </Link>

            <div className="mb-6 max-w-sm space-y-3">
              <p className="text-sm leading-7 text-white/64">{STOREFRONT_RUNTIME.tagline}</p>
              <div className="text-sm text-white/72">
                <p>{contactPhone}</p>
                <p className="break-all">{contactEmail}</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/52">
                Language
              </p>
              <div ref={localeMenuRef} className="relative w-fit">
                <button
                  type="button"
                  onClick={() => setIsLocaleMenuOpen((current) => !current)}
                  className="flex min-w-[132px] items-center justify-between gap-3 rounded-full border border-white/14 bg-white/10 px-4 py-3 text-left text-white transition hover:border-white/26 hover:bg-white/14"
                  aria-expanded={isLocaleMenuOpen}
                  aria-haspopup="listbox"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{activeLocaleOption.label}</span>
                    <span className="text-sm">{locale.toUpperCase()}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-white/70 transition-transform ${isLocaleMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isLocaleMenuOpen ? (
                  <div className="absolute left-0 top-full z-20 mt-2 min-w-[170px] overflow-hidden rounded-2xl border border-white/10 bg-[#17100b] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
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

            <div className="flex items-center gap-3">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/14 text-white/62 transition-all hover:border-white/40 hover:text-white"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/14 text-white/62 transition-all hover:border-white/40 hover:text-white"
                aria-label="YouTube"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-white/76">
              {copy.aboutHeading}
            </p>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={buildLocalizedPath(link.href, locale)}
                    className="text-sm text-white/62 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-white/76">
              {copy.categoriesHeading}
            </p>
            <ul className="space-y-3">
              {categoryLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    href={buildLocalizedPath(`/${link.slug}`, locale)}
                    className="text-sm text-white/62 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-white/76">
              {copy.policiesHeading}
            </p>
            <ul className="space-y-3">
              {resolvedPolicyLinks.map((link) => (
                <li key={link.slug}>
                  <Link
                    href={buildLocalizedPath(link.href, locale)}
                    className="text-sm text-white/62 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-premium flex flex-col items-center justify-between gap-4 py-6 lg:flex-row">
          <p className="text-xs text-white/48">
            &copy; {currentYear} {storeInfo?.name || SITE_NAME}. {copy.footerRights}
          </p>
          <a
            href="https://celebix.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-[0.2em] text-white/48 transition-colors hover:text-white"
          >
            Powered by Celebix
          </a>
        </div>
      </div>
    </footer>
  );
}
