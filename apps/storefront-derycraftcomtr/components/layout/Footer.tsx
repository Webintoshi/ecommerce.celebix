"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, SOCIAL_LINKS } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import type { PolicyFooterLink } from "@/lib/policy-pages";
import { type StorefrontLocale } from "@/lib/i18n";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import type { StorefrontFooterCategory } from "@/lib/storefront-navigation";
import { FooterIconInstagram, FooterIconMail, FooterIconYoutube } from "@/components/layout/FooterIcons";
import { HeaderIconChevron } from "@/components/layout/HeaderIcons";

type FooterLocaleCopy = {
  languageLabel: string;
  brandHeadline: string;
  brandStory: string;
  aboutHeading: string;
  categoriesHeading: string;
  policiesHeading: string;
  newsletterHeading: string;
  newsletterDescription: string;
  newsletterPlaceholder: string;
  newsletterSuccess: string;
  aboutLinks: Array<{ name: string; href: string }>;
  rights: string;
};

const LOCALE_SWITCH_OPTIONS: Array<{
  locale: StorefrontLocale;
  label: string;
  flag: string;
}> = [
  { locale: "tr", label: "Turkish", flag: "TR" },
  { locale: "en", label: "English", flag: "EN" },
  { locale: "de", label: "Deutsch", flag: "DE" },
  { locale: "ru", label: "Russian", flag: "RU" },
  { locale: "ar", label: "Arabic", flag: "AR" },
  { locale: "ka", label: "Georgian", flag: "KA" },
];

const ENGLISH_FOOTER_COPY: FooterLocaleCopy = {
  languageLabel: "Language",
  brandHeadline: "Crafted by hand",
  brandStory:
    "We unite traditional leather craftsmanship with contemporary design. Every piece is carefully made in our workshop.",
  aboutHeading: "Discover",
  categoriesHeading: "Categories",
  policiesHeading: "Policies",
  newsletterHeading: "Follow us",
  newsletterDescription: "Join our newsletter for new collections and private offers.",
  newsletterPlaceholder: "Your email address",
  newsletterSuccess: "Thank you. You are on the list.",
  aboutLinks: [
    { name: "Home", href: "/" },
    { name: "About", href: "/hakkimizda" },
    { name: "Stores", href: "/magazalarimiz" },
    { name: "Corporate Products", href: "/kurumsal-urunler" },
    { name: "Contact", href: "/iletisim" },
  ],
  rights: "All rights reserved.",
};

const TURKISH_FOOTER_COPY: FooterLocaleCopy = {
  languageLabel: "Dil",
  brandHeadline: "El işçiliğiyle üretilir",
  brandStory:
    "Geleneksel deri işçiliğini çağdaş tasarımla buluşturuyoruz. Her parça atölyemizde özenle, el emeğiyle üretilir.",
  aboutHeading: "Bizi Keşfedin",
  categoriesHeading: "Kategoriler",
  policiesHeading: "Politikalar",
  newsletterHeading: "Bizi Takip Edin",
  newsletterDescription: "Yeni koleksiyonlar ve özel teklifler için e-bültenimize kaydolun.",
  newsletterPlaceholder: "E-posta adresiniz",
  newsletterSuccess: "Teşekkürler. Listemize eklendiniz.",
  aboutLinks: [
    { name: "Ana Sayfa", href: "/" },
    { name: "Hakkımızda", href: "/hakkimizda" },
    { name: "Mağazalarımız", href: "/magazalarimiz" },
    { name: "Kurumsal Ürünler", href: "/kurumsal-urunler" },
    { name: "İletişim", href: "/iletisim" },
  ],
  rights: "Tüm hakları saklıdır.",
};

const CELEBIX_SITE_URL = "https://celebix.net/";
const CELEBIX_LOGO_URL = "https://celebix.net/Logo/koyu%20logo.svg";

const FOOTER_COPY: Record<StorefrontLocale, FooterLocaleCopy> = {
  tr: TURKISH_FOOTER_COPY,
  en: ENGLISH_FOOTER_COPY,
  de: ENGLISH_FOOTER_COPY,
  ru: ENGLISH_FOOTER_COPY,
  ar: ENGLISH_FOOTER_COPY,
  ka: ENGLISH_FOOTER_COPY,
};

function FooterColumnHeading({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 text-[10px] font-medium uppercase tracking-[0.32em] text-white/42">
      {children}
    </p>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex max-w-full text-[13px] leading-relaxed text-white/62 transition-colors duration-300 hover:text-white"
    >
      <span className="relative">
        {children}
        <span
          aria-hidden="true"
          className="absolute -bottom-px left-0 h-px w-0 bg-[#A67C3D] transition-all duration-300 ease-out group-hover:w-full"
        />
      </span>
    </Link>
  );
}

function FooterNewsletter({ copy }: { copy: FooterLocaleCopy }) {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      return;
    }

    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setSubscribed(true);
      setEmail("");
    }, 700);
  };

  return (
    <div>
      <FooterColumnHeading>{copy.newsletterHeading}</FooterColumnHeading>
      <p className="max-w-xs text-[13px] leading-7 text-white/50">{copy.newsletterDescription}</p>

      {subscribed ? (
        <p className="mt-6 text-[13px] text-[#C9A86A]">{copy.newsletterSuccess}</p>
      ) : (
        <form onSubmit={handleSubmit} className="group/form relative mt-7 max-w-sm">
          <div className="border-b border-white/22 pb-2 transition-colors duration-300 group-focus-within/form:border-[#8B6914]/80">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={copy.newsletterPlaceholder}
              required
              disabled={loading}
              className="w-full bg-transparent pr-10 text-[13px] text-white outline-none placeholder:text-white/30"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="absolute bottom-2 right-0 text-white/45 transition-colors hover:text-white disabled:opacity-40"
            aria-label={copy.newsletterHeading}
          >
            <FooterIconMail />
          </button>
        </form>
      )}
    </div>
  );
}

export function Footer({ categoryLinks }: { categoryLinks: StorefrontFooterCategory[] }) {
  const { storeInfo } = useStoreInfo();
  const [policyLinks, setPolicyLinks] = useState<PolicyFooterLink[]>([]);
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false);
  const { locale, internalPathname, routing, buildPath } = useStorefrontRoute();
  const localeMenuRef = useRef<HTMLDivElement | null>(null);
  const currentYear = new Date().getFullYear();
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);
  const copy = useMemo(() => FOOTER_COPY[locale], [locale]);
  const localeSwitchOptions = LOCALE_SWITCH_OPTIONS.filter((option) =>
    routing.availableLocales.includes(option.locale),
  );
  const activeLocaleOption =
    localeSwitchOptions.find((option) => option.locale === locale) ?? LOCALE_SWITCH_OPTIONS[1];

  const contactEmail = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const contactPhone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const instagramUrl = storeInfo?.socialInstagram || SOCIAL_LINKS.instagram;
  const youtubeUrl = SOCIAL_LINKS.youtube || SOCIAL_LINKS.instagram;

  const brandHeadline = SITE_TAGLINE || copy.brandHeadline;
  const brandStory =
    SITE_DESCRIPTION && !SITE_DESCRIPTION.includes("Celebix ile yonetilen")
      ? SITE_DESCRIPTION
      : copy.brandStory;

  useEffect(() => {
    let isMounted = true;

    const loadPolicies = async () => {
      try {
        const policyResponse = await fetch(`/api/policies?locale=${encodeURIComponent(locale)}`, {
          cache: "no-store",
        });

        if (!isMounted) {
          return;
        }

        if (policyResponse.ok) {
          const payload = (await policyResponse.json()) as {
            pages?: PolicyFooterLink[];
          };
          setPolicyLinks(Array.isArray(payload.pages) ? payload.pages : []);
        } else {
          setPolicyLinks([]);
        }
      } catch (error) {
        console.error("Failed to load footer policies:", error);
        setPolicyLinks([]);
      }
    };

    void loadPolicies();

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
    <footer className="relative bg-[#0A0D14] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8B6914]/55 to-transparent"
      />

      <div className="container-premium py-16 md:py-20 lg:py-24">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-12 lg:gap-x-10 xl:gap-x-14">
          <div className="sm:col-span-2 lg:col-span-4">
            <Link href={buildPath("/")} className="inline-block">
              {logoSrc ? (
                <div className="relative h-9 w-[140px]">
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    fill
                    className="object-contain object-left brightness-0 invert"
                    sizes="140px"
                    unoptimized={usesProxiedLogo}
                  />
                </div>
              ) : (
                <span className="font-serif text-2xl tracking-wide text-white">{logoAlt}</span>
              )}
            </Link>

            <h2 className="mt-8 font-serif text-[1.65rem] leading-tight tracking-[-0.02em] text-white sm:text-[1.85rem]">
              {brandHeadline}
            </h2>
            <p className="mt-4 max-w-sm text-[13px] leading-7 text-white/52">{brandStory}</p>

            <div className="mt-8 space-y-2.5">
              <a
                href={`tel:${contactPhone.replace(/\s+/g, "")}`}
                className="block text-[13px] text-white/58 transition-colors hover:text-white"
              >
                {contactPhone}
              </a>
              <a
                href={`mailto:${contactEmail}`}
                className="block break-all text-[13px] text-white/58 transition-colors hover:text-white"
              >
                {contactEmail}
              </a>
            </div>

            {routing.showLocaleSwitcher ? (
              <div className="mt-8">
                <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                  {copy.languageLabel}
                </p>
                <div ref={localeMenuRef} className="relative w-fit">
                  <button
                    type="button"
                    onClick={() => setIsLocaleMenuOpen((current) => !current)}
                    className="flex items-center gap-2 border-b border-white/18 pb-1.5 text-[12px] text-white/70 transition-colors hover:border-white/40 hover:text-white"
                    aria-expanded={isLocaleMenuOpen}
                    aria-haspopup="listbox"
                  >
                    <span className="text-[10px] font-semibold tracking-wider text-white/45">
                      {activeLocaleOption.flag}
                    </span>
                    <span>{activeLocaleOption.label}</span>
                    <HeaderIconChevron
                      className={`text-white/45 transition-transform duration-300 ${isLocaleMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isLocaleMenuOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-3 min-w-[180px] overflow-hidden rounded-lg border border-white/10 bg-[#12161F] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                      {localeSwitchOptions.map((option) => {
                        const isActive = option.locale === locale;

                        return (
                          <Link
                            key={option.locale}
                            href={buildPath(internalPathname, option.locale)}
                            hrefLang={option.locale}
                            onClick={() => setIsLocaleMenuOpen(false)}
                            className={`flex items-center gap-2 rounded-md px-3 py-2 text-[13px] transition ${
                              isActive
                                ? "bg-white/10 text-white"
                                : "text-white/65 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="text-[10px] font-semibold tracking-wider text-white/45">
                              {option.flag}
                            </span>
                            <span>{option.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="lg:col-span-2">
            <FooterColumnHeading>{copy.aboutHeading}</FooterColumnHeading>
            <ul className="space-y-3.5">
              {copy.aboutLinks.map((link) => (
                <li key={link.href}>
                  <FooterLink href={buildPath(link.href)}>{link.name}</FooterLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <FooterColumnHeading>{copy.categoriesHeading}</FooterColumnHeading>
            <ul className="space-y-3.5">
              {categoryLinks.map((link) => (
                <li key={link.id}>
                  <FooterLink href={buildPath(`/${link.slug}`)}>{link.name}</FooterLink>
                </li>
              ))}
            </ul>
          </div>

          {policyLinks.length > 0 ? (
            <div className="lg:col-span-2">
              <FooterColumnHeading>{copy.policiesHeading}</FooterColumnHeading>
              <ul className="space-y-3.5">
                {policyLinks.map((link) => (
                  <li key={link.slug}>
                    <FooterLink href={buildPath(link.href)}>{link.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={policyLinks.length > 0 ? "lg:col-span-2" : "sm:col-span-2 lg:col-span-4"}>
            <FooterNewsletter copy={copy} />

            <div className="mt-10 flex items-center gap-6">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 transition-colors duration-300 hover:text-white"
                aria-label="Instagram"
              >
                <FooterIconInstagram />
              </a>
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 transition-colors duration-300 hover:text-white"
                aria-label="YouTube"
              >
                <FooterIconYoutube />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="container-premium flex flex-col items-center justify-between gap-4 py-6 md:flex-row md:py-7">
          <p className="text-center text-[11px] tracking-wide text-white/38 md:text-left">
            © {currentYear} {storeInfo?.name || SITE_NAME}. {copy.rights}
          </p>
          <a
            href={CELEBIX_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center"
            aria-label="Celebix"
          >
            <img
              src={CELEBIX_LOGO_URL}
              alt="Celebix"
              className="h-6 w-auto brightness-0 invert opacity-75 transition-opacity group-hover:opacity-100 sm:h-7"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
