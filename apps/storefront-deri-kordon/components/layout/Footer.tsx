"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Instagram, Youtube } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

type FooterCategory = {
  id: string;
  name: string;
  slug: string;
};

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const [categoryLinks, setCategoryLinks] = useState<FooterCategory[]>([]);
  const currentYear = new Date().getFullYear();
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const categories = await fetchCategories();
        if (!isMounted) return;

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
    { name: "Ana Sayfa", href: "/" },
    { name: "Hakkımızda", href: "/hakkimizda" },
    { name: "Mağazalarımız", href: "/magazalarimiz" },
    { name: "Kurumsal Sipariş", href: "/kurumsal-urunler" },
    { name: "İletişim", href: "/iletisim" },
  ];

  const policyLinks = [
    { name: "Mesafeli Satış Sözleşmesi", href: "/mesafeli-satis-sozlesmesi" },
    { name: "Teslimat & İade Politikası", href: "/iade" },
    { name: "Gizlilik Politikası", href: "/gizlilik" },
    { name: "KVKK", href: "/kvkk" },
  ];

  return (
    <footer className="bg-[#0B1120] text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            {/* Logo */}
            <Link href="/" className="inline-block mb-6">
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
                <span className="text-2xl font-light tracking-wide" style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}>
                  DeryCraft
                </span>
              )}
            </Link>

            {/* Contact Info */}
            <div className="space-y-2 mb-6">
              <p className="text-sm text-gray-300">+90 (507) 559-7228</p>
              <p className="text-sm text-gray-300">bilgi@derycraft.com</p>
            </div>

            {/* Social Icons */}
            <div className="flex items-center gap-3">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full border border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-all"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full border border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-all"
                aria-label="YouTube"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* About Us Column */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-5" style={{ color: "#ffffff" }}>
              BİZİ TANIYIN
            </h3>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories Column */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-5" style={{ color: "#ffffff" }}>
              KATEGORİLER
            </h3>
            <ul className="space-y-3">
              {categoryLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    href={`/${link.slug}`}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name.toUpperCase()}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Policies Column */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-5" style={{ color: "#ffffff" }}>
              POLİTİKALAR
            </h3>
            <ul className="space-y-3">
              {policyLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              © {currentYear} {storeInfo?.name || SITE_NAME}. Tüm hakları saklıdır.
            </p>
            <a
              href="https://celebix.co"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <span className="text-xs">Powered by</span>
              <img
                src="https://celebix.co/Logo/koyu%20logo.svg"
                alt="Celebix"
                className="h-5 w-auto brightness-0 invert"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
