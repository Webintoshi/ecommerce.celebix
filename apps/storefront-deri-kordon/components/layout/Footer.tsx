"use client";

import { useEffect, useMemo, useState } from "react";
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
  buildLocalizedPath,
  getLocaleFromPathname,
  getLocalizedCategoryLabel,
  getLocalizedCopy,
} from "@/lib/i18n";

type FooterCategory = {
  id: string;
  name: string;
  slug: string;
};

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const pathname = usePathname();
  const [categoryLinks, setCategoryLinks] = useState<FooterCategory[]>([]);
  const currentYear = new Date().getFullYear();
  const locale = getLocaleFromPathname(pathname) || DEFAULT_LOCALE;
  const copy = useMemo(() => getLocalizedCopy(locale), [locale]);
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const categories = await fetchCategories();
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
    { name: copy.footerHome, href: "/" },
    { name: copy.footerAbout, href: "/hakkimizda" },
    { name: copy.footerStores, href: "/magazalarimiz" },
    { name: copy.footerCorporate, href: "/kurumsal-urunler" },
    { name: copy.footerContact, href: "/iletisim" },
  ];

  const policyLinks = [
    { name: copy.footerDistanceSales, href: "/mesafeli-satis-sozlesmesi" },
    { name: copy.footerReturns, href: "/iade" },
    { name: copy.footerPrivacy, href: "/gizlilik" },
    { name: copy.footerKvkk, href: "/kvkk" },
  ];

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

            <div className="flex items-center gap-3">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-600 text-gray-400 transition-all hover:border-white hover:text-white"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="https://youtube.com"
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
              {copy.aboutHeading}
            </h3>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.name}>
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
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-white">
              {copy.categoriesHeading}
            </h3>
            <ul className="space-y-3">
              {categoryLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    href={buildLocalizedPath(`/${link.slug}`, locale)}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {getLocalizedCategoryLabel(link.slug, link.name, locale).toUpperCase()}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-white">
              {copy.policiesHeading}
            </h3>
            <ul className="space-y-3">
              {policyLinks.map((link) => (
                <li key={link.name}>
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
        </div>
      </div>

      <div className="border-t border-gray-800">
        <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-xs text-gray-500">
              © {currentYear} {storeInfo?.name || SITE_NAME}. {copy.footerRights}
            </p>
            <a
              href="https://celebix.co"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
            >
              <span className="text-xs">Powered by</span>
              <img
                src="https://celebix.co/Logo/koyu%20logo.svg"
                alt="Celebix"
                className="h-7 w-auto brightness-0 invert"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
