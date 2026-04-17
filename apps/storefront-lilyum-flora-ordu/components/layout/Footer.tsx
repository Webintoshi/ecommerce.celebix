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
    { name: "T\u00fcm \u00dcr\u00fcnler", href: "/urunler" },
    { name: "SSS", href: "/sss" },
  ];

  return (
    <footer className="border-t border-[var(--store-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f6f6f6_48%,#edf1f5_100%)] text-[var(--store-ink)]">
      <div className="container-premium py-10 sm:py-12">
        <div className="rounded-[38px] border border-[var(--store-border)] bg-white/88 p-6 shadow-[0_24px_60px_rgba(80,94,113,0.08)] backdrop-blur-sm sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.8fr_0.8fr_0.9fr] lg:gap-10">
            <div className="rounded-[30px] border border-[var(--store-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f9fafb_100%)] p-6 sm:p-7">
              <Link href={buildLocalizedPath("/", locale)} className="inline-flex items-center">
                {logoSrc ? (
                  <div className="relative h-12 w-[176px]">
                    <Image
                      src={logoSrc}
                      alt={logoAlt}
                      fill
                      className="object-contain object-left"
                      sizes="176px"
                      unoptimized={usesProxiedLogo}
                    />
                  </div>
                ) : (
                  <p className="font-[var(--font-display)] text-3xl font-semibold tracking-[-0.05em] text-[var(--store-ink)]">
                    {logoAlt}
                  </p>
                )}
              </Link>

              <div className="mt-6 grid gap-3 text-sm text-[var(--store-ink-soft)]">
                <a
                  href={`tel:${contactPhone}`}
                  className="inline-flex items-center gap-3 rounded-full border border-[var(--store-border)] bg-white px-4 py-3 transition hover:border-[var(--store-accent)] hover:text-[var(--store-ink)]"
                >
                  <Phone className="h-4 w-4 text-[var(--store-accent)]" />
                  {contactPhone}
                </a>
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center gap-3 rounded-full border border-[var(--store-border)] bg-white px-4 py-3 transition hover:border-[var(--store-accent)] hover:text-[var(--store-ink)]"
                >
                  <Mail className="h-4 w-4 text-[var(--store-accent)]" />
                  {contactEmail}
                </a>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                  aria-label="Instagram"
                >
                  <Instagram className="h-4 w-4" />
                </a>
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                  aria-label="YouTube"
                >
                  <Youtube className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="lg:pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--store-accent)]">
                {copy.aboutHeading}
              </p>
              <ul className="mt-5 space-y-3.5">
                {aboutLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={buildLocalizedPath(link.href, locale)}
                      className="text-[15px] text-[var(--store-ink-soft)] transition hover:text-[var(--store-accent)]"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--store-accent)]">
                {copy.categoriesHeading}
              </p>
              <ul className="mt-5 space-y-3.5">
                {categoryLinks.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={buildLocalizedPath(`/${link.slug}`, locale)}
                      className="text-[15px] text-[var(--store-ink-soft)] transition hover:text-[var(--store-accent)]"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-6 lg:pt-3">
              {policyLinks.length > 0 ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--store-accent)]">
                    {copy.policiesHeading}
                  </p>
                  <ul className="mt-5 space-y-3.5">
                    {policyLinks.map((link) => (
                      <li key={link.slug}>
                        <Link
                          href={buildLocalizedPath(link.href, locale)}
                          className="text-[15px] text-[var(--store-ink-soft)] transition hover:text-[var(--store-accent)]"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-[26px] border border-[var(--store-border)] bg-[var(--store-surface-alt)] p-4 sm:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--store-accent)]">
                  Dil
                </p>
                <div ref={localeMenuRef} className="relative mt-4">
                  <button
                    type="button"
                    onClick={() => setIsLocaleMenuOpen((current) => !current)}
                    className="flex w-full min-w-[132px] items-center justify-between gap-3 rounded-full border border-[var(--store-border)] bg-white px-4 py-3 text-left text-[var(--store-ink)] shadow-[0_10px_24px_rgba(80,94,113,0.08)] transition hover:border-[var(--store-accent)]"
                    aria-expanded={isLocaleMenuOpen}
                    aria-haspopup="listbox"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {LOCALE_SWITCH_OPTIONS.find((option) => option.locale === locale)?.label || "TR"}
                      </span>
                      <span className="text-xs uppercase text-[var(--store-muted)]">{locale}</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-[var(--store-ink-soft)] transition-transform ${isLocaleMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isLocaleMenuOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-2 min-w-full overflow-hidden rounded-[24px] border border-[var(--store-border)] bg-white p-2 shadow-[0_24px_70px_rgba(80,94,113,0.16)]">
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
                                  ? "bg-[var(--store-surface-alt)] text-[var(--store-ink)]"
                                  : "text-[var(--store-ink-soft)] hover:bg-[var(--store-surface-alt)] hover:text-[var(--store-accent)]"
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
      </div>

      <div className="border-t border-[var(--store-border)] bg-white/55">
        <div className="container-premium flex flex-col items-center justify-between gap-3 py-5 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-[var(--store-ink-soft)]">
            &copy; {currentYear} {storeInfo?.name || SITE_NAME}. {copy.footerRights}
          </p>
          <a
            href="https://celebix.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-[0.2em] text-[var(--store-muted)] transition hover:text-[var(--store-accent)]"
          >
            Powered by Celebix
          </a>
        </div>
      </div>
    </footer>
  );
}
