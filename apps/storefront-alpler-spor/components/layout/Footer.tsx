"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  CreditCard,
  Instagram,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  Truck,
  Youtube,
} from "lucide-react";
import { SITE_LOGO_PATH, SITE_NAME, SOCIAL_LINKS } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { repairDisplayText } from "@/lib/display-text";
import type { PolicyFooterLink } from "@/lib/policy-pages";
import { resolveStoreAddress } from "@/lib/storefront-profile";
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
  const footerLogoClass = shouldUsePlaceholderLogo
    ? "object-contain object-left"
    : "object-contain object-left contrast-125 invert mix-blend-screen";
  const localeSwitchOptions = routing.availableLocales.map((entryLocale) => ({
    locale: entryLocale,
    label: LOCALE_LABELS[entryLocale],
  }));
  const activeLocaleOption =
    localeSwitchOptions.find((option) => option.locale === locale) ?? localeSwitchOptions[0];

  const contactEmail = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const contactPhone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const contactAddress = resolveStoreAddress(storeInfo?.address);
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
    { name: "Ana Sayfa", href: "/" },
    { name: "Tüm Ürünler", href: "/urunler" },
    { name: "Favoriler", href: "/favoriler" },
    { name: "Sepet", href: "/sepet" },
  ];
  const accountLinks = [
    { name: "Giriş", href: "/giris" },
    { name: "Kayıt", href: "/kayit" },
    { name: "Hesabım", href: "/hesap" },
  ];
  const supportLinks = [
    { name: "İletişim", href: "/iletisim" },
    { name: "Hakkımızda", href: "/hakkimizda" },
    { name: "Sıkça Sorulan Sorular", href: "/sss" },
    { name: "İade / Değişim", href: "/iade" },
  ];
  const legalLinks = policyLinks.length > 0
    ? policyLinks.slice(0, 5).map((link) => ({ name: link.label, href: link.href }))
    : [
        { name: "Gizlilik", href: "/gizlilik" },
        { name: "Şartlar", href: "/sartlar" },
        { name: "Kargo Politikası", href: "/kargo" },
      ];
  const socialLinks = [
    instagramUrl ? { label: "Instagram", href: instagramUrl, icon: Instagram } : null,
    youtubeUrl ? { label: "YouTube", href: youtubeUrl, icon: Youtube } : null,
  ].filter((item): item is { label: string; href: string; icon: typeof Instagram } => Boolean(item));
  const linkGroups = [
    { title: "Mağaza", links: aboutLinks },
    { title: "Hesap", links: accountLinks },
    { title: "Destek", links: supportLinks },
    { title: "Yasal", links: legalLinks },
  ];
  const trustItems = [
    { label: "Güvenli Ödeme", text: "SSL korumalı alışveriş", icon: ShieldCheck },
    { label: "Hızlı Teslimat", text: "2-4 iş günü hedefi", icon: Truck },
    { label: "Kolay İade", text: "Net destek süreci", icon: RotateCcw },
    { label: "Esnek Ödeme", text: "Mağaza ayarlarına bağlı", icon: CreditCard },
  ];

  return (
    <footer className="relative overflow-hidden bg-[#070B10] text-white">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(255,106,0,0.14),transparent_30%),linear-gradient(180deg,#0B0F14_0%,#07101C_100%)]"
        aria-hidden="true"
      />

      <div className="container-premium relative py-12 sm:py-14 lg:py-20">
        <section className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,106,0,0.18)_0%,rgba(255,255,255,0.07)_42%,rgba(10,16,28,0.86)_100%)] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)] sm:p-6 lg:mb-10 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#FF9A4C]">
                Alpler Spor Vitrini
              </p>
              <h2 className="mt-3 max-w-3xl text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">
                Alpler Spor ile stilini tamamla
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#D6DEE9] sm:text-[15px]">
                Yeni sezon spor ve sneaker seçkilerini keşfet; favorilerini kaydet,
                sepetini hızla tamamla.
              </p>
            </div>

            <div className="flex flex-col gap-3 min-[420px]:flex-row lg:justify-end">
              <Link
                href={buildPath("/urunler")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#FF6A00] px-5 text-sm font-black text-white transition hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/30"
              >
                Ürünleri Keşfet
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={buildPath("/urunler")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 px-5 text-sm font-black text-white transition hover:border-[#FF8A3D] hover:bg-white/12 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/15"
              >
                Kategorilere Göz At
              </Link>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.7fr)] lg:gap-8">
          <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur sm:p-6">
            <Link href={buildPath("/")} className="inline-flex" aria-label={logoAlt}>
              {logoSrc ? (
                <div className="relative h-16 w-[210px] sm:h-[4.5rem] sm:w-[240px]">
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    fill
                    className={footerLogoClass}
                    sizes="(max-width: 640px) 210px, 240px"
                    unoptimized={usesProxiedLogo}
                  />
                </div>
              ) : (
                <span className="text-3xl font-black tracking-tight">{logoAlt}</span>
              )}
            </Link>

            <p className="mt-5 max-w-md text-sm leading-7 text-[#B8C3D3]">
              Spor giyim, sneaker ve günlük stil ürünlerinde hızlı, güvenli ve sade
              alışveriş deneyimi.
            </p>

            <div className="mt-6 grid gap-3">
              <a
                href={`tel:${contactPhone.replace(/\s+/g, "")}`}
                className="group flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.055] p-3 transition hover:border-[#FF6A00]/40 hover:bg-white/[0.08]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FF6A00]/12 text-[#FF7A1A]">
                  <Phone className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-[#7E8BA3]">
                    Telefon
                  </span>
                  <span className="block text-sm font-semibold text-white transition group-hover:text-[#FF9A4C]">
                    {contactPhone}
                  </span>
                </span>
              </a>

              <a
                href={`mailto:${contactEmail}`}
                className="group flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.055] p-3 transition hover:border-[#FF6A00]/40 hover:bg-white/[0.08]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FF6A00]/12 text-[#FF7A1A]">
                  <Mail className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-[#7E8BA3]">
                    E-posta
                  </span>
                  <span className="block break-all text-sm font-semibold text-white transition group-hover:text-[#FF9A4C]">
                    {contactEmail}
                  </span>
                </span>
              </a>

              <div className="flex items-start gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.055] p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FF6A00]/12 text-[#FF7A1A]">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-[#7E8BA3]">
                    Mağaza
                  </span>
                  <span className="block text-sm leading-6 text-[#D6DEE9]">
                    {repairDisplayText(contactAddress)}
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {socialLinks.map((item) => {
                const Icon = item.icon;

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-[#CBD5E1] transition-all hover:border-[#FF6A00] hover:text-[#FF6A00]"
                    aria-label={item.label}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {linkGroups.map((group) => (
                <nav
                  key={group.title}
                  className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5"
                  aria-label={group.title}
                >
                  <p className="mb-5 text-[11px] font-black uppercase tracking-[0.28em] text-white">
                    {group.title}
                  </p>
                  <ul className="space-y-3">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={buildPath(link.href)}
                          className="inline-flex min-h-8 items-center text-sm text-[#CBD5E1] transition-colors hover:text-[#FF8A3D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/20"
                        >
                          {repairDisplayText(link.name)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {trustItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className="rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-4 transition hover:border-[#FF6A00]/35 hover:bg-white/[0.065]"
                  >
                    <Icon className="h-4 w-4 text-[#FF7A1A]" />
                    <p className="mt-3 text-sm font-bold text-white">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-[#8D99AE]">{item.text}</p>
                  </div>
                );
              })}
            </div>

            {routing.showLocaleSwitcher ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#7E8BA3]">
                    Dil
                  </p>
                  <p className="mt-1 text-sm text-[#CBD5E1]">
                    Mağaza deneyimi için dil seçimini güncelleyin.
                  </p>
                </div>

                <div ref={localeMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsLocaleMenuOpen((current) => !current)}
                    className="flex min-w-[150px] items-center justify-between gap-3 rounded-2xl border border-white/12 bg-white px-3 py-3 text-left text-[#111827] transition hover:border-[#FF6A00]"
                    aria-expanded={isLocaleMenuOpen}
                    aria-haspopup="listbox"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{activeLocaleOption.label}</span>
                      <span className="text-xs uppercase text-[#6B7280]">{locale}</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-[#374151] transition-transform ${isLocaleMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isLocaleMenuOpen ? (
                    <div className="absolute bottom-full right-0 z-20 mb-2 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-[#111827] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
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
                                  ? "bg-white text-[#111827]"
                                  : "text-white/88 hover:bg-white/10 hover:text-[#FF8A3D]"
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
          </section>
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <div className="container-premium flex flex-col items-center justify-between gap-4 py-5 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-[#94A3B8]">
            &copy; {currentYear} {storeInfo?.name || SITE_NAME}. {copy.footerRights}
          </p>
          <a
            href="https://celebix.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-[0.24em] text-[#7E8BA3] transition-colors hover:text-[#FF8A3D]"
          >
            Powered by Celebix
          </a>
        </div>
      </div>
    </footer>
  );
}
