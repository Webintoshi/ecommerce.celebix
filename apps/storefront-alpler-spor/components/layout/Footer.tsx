"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown,
  Instagram,
  Mail,
  Phone,
  ShieldCheck,
  Youtube,
} from "lucide-react";
import { SITE_DESCRIPTION, SITE_LOGO_PATH, SITE_NAME, SOCIAL_LINKS } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { repairDisplayText } from "@/lib/display-text";
import type { PolicyFooterLink } from "@/lib/policy-pages";
import { LOCALE_LABELS, getLocalizedCopy } from "@/lib/i18n";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

type FooterCategory = {
  id: string;
  name: string;
  slug: string;
};

function normalizePhoneHref(phone: string) {
  const normalized = phone.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : "#";
}

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const [categoryLinks, setCategoryLinks] = useState<FooterCategory[]>([]);
  const [policyLinks, setPolicyLinks] = useState<PolicyFooterLink[]>([]);
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false);
  const { locale, internalPathname, routing, buildPath } = useStorefrontRoute();
  const localeMenuRef = useRef<HTMLDivElement | null>(null);
  const currentYear = new Date().getFullYear();
  const copy = useMemo(() => getLocalizedCopy(locale), [locale]);
  const shouldUsePlaceholderLogo =
    !storeInfo?.logoUrl &&
    typeof SITE_LOGO_PATH === "string" &&
    SITE_LOGO_PATH.includes("placeholder-storefront-logo");
  const preferredLogoPath = shouldUsePlaceholderLogo ? "/logo.webp" : SITE_LOGO_PATH;
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || preferredLogoPath);
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
  const instagramUrl = storeInfo?.socialInstagram || SOCIAL_LINKS.instagram;
  const youtubeUrl =
    SOCIAL_LINKS.youtube && SOCIAL_LINKS.youtube !== instagramUrl ? SOCIAL_LINKS.youtube : "";
  const brandDescription =
    storeInfo?.name && storeInfo.name !== SITE_NAME
      ? `${storeInfo.name} ile orijinal spor ayakkabı ve performans ürünlerinde hızlı, güvenli alışveriş deneyimi.`
      : "Orijinal spor ayakkabı ve performans ürünlerinde hızlı, güvenli alışveriş deneyimi.";

  const socialLinks = [
    {
      href: instagramUrl,
      label: "Instagram",
      icon: Instagram,
    },
    ...(youtubeUrl
      ? [
          {
            href: youtubeUrl,
            label: "YouTube",
            icon: Youtube,
          },
        ]
      : []),
  ].filter((entry) => Boolean(entry.href));

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
            name: repairDisplayText(category.name),
            slug: category.slug,
          }));

        setCategoryLinks(topLevelCategories);
        if (policyResponse.ok) {
          const payload = (await policyResponse.json()) as {
            pages?: PolicyFooterLink[];
          };
          setPolicyLinks(
            Array.isArray(payload.pages)
              ? payload.pages.map((page) => ({
                  ...page,
                  label: repairDisplayText(page.label),
                }))
              : [],
          );
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
    { name: copy.breadcrumbProducts, href: "/urunler" },
    { name: copy.faqHeading, href: "/sss" },
    { name: copy.footerContact, href: "/iletisim" },
  ];

  return (
    <footer className="relative overflow-hidden bg-[#0B0F14] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF6A00] to-transparent opacity-80" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,106,0,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.12),transparent_28%)]" />

      <div className="relative mx-auto max-w-[1280px] px-5 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-[1.35fr_0.9fr_0.9fr_0.95fr] xl:gap-10">
          <div className="space-y-6">
            <div className="space-y-4">
              <Link href={buildPath("/")} className="inline-flex max-w-full items-center">
                {logoSrc ? (
                  <div className="relative h-11 w-[182px] sm:h-12 sm:w-[198px] lg:h-[52px] lg:w-[212px]">
                    <Image
                      src={logoSrc}
                      alt={logoAlt}
                      fill
                      className="object-contain object-left brightness-0 invert"
                      sizes="(max-width: 640px) 182px, (max-width: 1024px) 198px, 212px"
                      unoptimized={usesProxiedLogo}
                    />
                  </div>
                ) : (
                  <span className="text-2xl font-semibold tracking-[0.08em] text-white">
                    {logoAlt}
                  </span>
                )}
              </Link>

              <p className="max-w-sm text-sm leading-6 text-[#CBD5E1]">
                {brandDescription || SITE_DESCRIPTION}
              </p>
            </div>

            <div className="grid gap-3 sm:max-w-md">
              <a
                href={normalizePhoneHref(contactPhone)}
                className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E2E8F0] transition hover:border-[#FF6A00]/40 hover:bg-white/8"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[#FF6A00]">
                  <Phone className="h-4 w-4" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94A3B8]">
                    Telefon
                  </span>
                  <span className="text-sm font-medium text-white group-hover:text-[#FF6A00]">
                    {contactPhone}
                  </span>
                </span>
              </a>

              <a
                href={`mailto:${contactEmail}`}
                className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E2E8F0] transition hover:border-[#FF6A00]/40 hover:bg-white/8"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[#FF6A00]">
                  <Mail className="h-4 w-4" />
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94A3B8]">
                    E-Posta
                  </span>
                  <span className="truncate text-sm font-medium text-white group-hover:text-[#FF6A00]">
                    {contactEmail}
                  </span>
                </span>
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {socialLinks.map((entry) => {
                const Icon = entry.icon;
                return (
                  <a
                    key={entry.label}
                    href={entry.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/6 text-[#E2E8F0] shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-all hover:-translate-y-0.5 hover:border-[#FF6A00]/60 hover:bg-[#FF6A00] hover:text-white"
                    aria-label={entry.label}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>

            {routing.showLocaleSwitcher ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#94A3B8]">
                  Language
                </p>
                <div ref={localeMenuRef} className="relative w-fit">
                  <button
                    type="button"
                    onClick={() => setIsLocaleMenuOpen((current) => !current)}
                    className="flex min-w-[138px] items-center justify-between gap-3 rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-left text-white transition hover:border-[#FF6A00]/50 hover:bg-white/8"
                    aria-expanded={isLocaleMenuOpen}
                    aria-haspopup="listbox"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{activeLocaleOption.label}</span>
                      <span className="text-xs uppercase text-[#94A3B8]">{locale.toUpperCase()}</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-[#CBD5E1] transition-transform ${isLocaleMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isLocaleMenuOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-2 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-[#111827] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                      <div className="space-y-1">
                        {localeSwitchOptions.map((option) => {
                          const isActive = option.locale === locale;
                          return (
                            <Link
                              key={option.locale}
                              href={buildPath(internalPathname, option.locale)}
                              hrefLang={option.locale}
                              onClick={() => setIsLocaleMenuOpen(false)}
                              className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition ${
                                isActive
                                  ? "bg-white text-[#111827]"
                                  : "text-white/88 hover:bg-white/10 hover:text-[#FF6A00]"
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
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
              {copy.aboutHeading}
            </p>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={buildPath(link.href)}
                    className="text-sm text-[#CBD5E1] transition-colors hover:text-[#FF6A00]"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {categoryLinks.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
                {copy.categoriesHeading}
              </p>
              <ul className="space-y-3">
                {categoryLinks.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={buildPath(`/koleksiyon/${link.slug}`)}
                      className="text-sm text-[#CBD5E1] transition-colors hover:text-[#FF6A00]"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
              {policyLinks.length > 0 ? copy.policiesHeading : "Alışveriş"}
            </p>

            {policyLinks.length > 0 ? (
              <ul className="space-y-3">
                {policyLinks.map((link) => (
                  <li key={link.slug}>
                    <Link
                      href={buildPath(link.href)}
                      className="text-sm text-[#CBD5E1] transition-colors hover:text-[#FF6A00]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-[#CBD5E1]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[#FF6A00]">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div className="space-y-1">
                    <p className="font-medium text-white">Güvenli alışveriş deneyimi</p>
                    <p className="leading-6 text-[#94A3B8]">
                      Sipariş, teslimat ve destek bilgileri mağaza ayarlarına göre otomatik
                      güncellenir.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/10 bg-black/10">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-3 px-5 py-5 text-center sm:px-6 lg:flex-row lg:px-8 lg:text-left">
          <p className="text-xs text-[#94A3B8]">
            &copy; {currentYear} {storeInfo?.name || SITE_NAME}. {copy.footerRights}
          </p>
          <a
            href="https://celebix.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-[0.22em] text-[#64748B] transition-colors hover:text-[#FF6A00]"
          >
            Powered by Celebix
          </a>
        </div>
      </div>
    </footer>
  );
}
