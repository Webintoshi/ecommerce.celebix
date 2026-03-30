"use client";

import Image from "next/image";
import Link from "next/link";
import { Instagram, Mail, Phone, MapPin } from "lucide-react";
import {
  CONTACT_INFO,
  FOOTER_LINKS,
  SITE_NAME,
  SOCIAL_LINKS,
} from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const currentYear = new Date().getFullYear();
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);

  const contactInfo = {
    email: storeInfo?.email || CONTACT_INFO.email,
    phone: storeInfo?.phone || CONTACT_INFO.phone,
    address: storeInfo?.address || "İstanbul, Türkiye",
  };

  return (
    <footer className="bg-neutral-900 text-white">
      <div className="container-premium py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          <div className="lg:col-span-1">
            <Link href="/" className="inline-block mb-6">
              {logoSrc ? (
                <div className="relative h-12 w-[180px]">
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    fill
                    className="object-contain object-left"
                    sizes="180px"
                    unoptimized={usesProxiedLogo}
                  />
                </div>
              ) : (
                <span className="font-serif text-2xl font-medium">
                  {logoAlt}
                </span>
              )}
            </Link>
            <p className="text-neutral-400 text-sm leading-relaxed mb-6">
              El yapımı hakiki deri ürünler. Zamana meydan okuyan şıklık.
            </p>
            <div className="flex items-center gap-4">
              <a
                href={SOCIAL_LINKS.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-sm uppercase tracking-wider mb-6">
              Keşfet
            </h4>
            <ul className="space-y-3">
              {FOOTER_LINKS.discover.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-neutral-400 text-sm hover:text-white transition-colors"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-sm uppercase tracking-wider mb-6">
              Kurumsal
            </h4>
            <ul className="space-y-3">
              {FOOTER_LINKS.company.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-neutral-400 text-sm hover:text-white transition-colors"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-sm uppercase tracking-wider mb-6">
              İletişim
            </h4>
            <ul className="space-y-4">
              <li>
                <a
                  href={`mailto:${contactInfo.email}`}
                  className="flex items-center gap-3 text-neutral-400 text-sm hover:text-white transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  {contactInfo.email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${contactInfo.phone}`}
                  className="flex items-center gap-3 text-neutral-400 text-sm hover:text-white transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  {contactInfo.phone}
                </a>
              </li>
              <li className="flex items-start gap-3 text-neutral-400 text-sm">
                <MapPin className="w-4 h-4 mt-0.5" />
                {contactInfo.address}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-800">
        <div className="container-premium py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-neutral-500 text-sm">
              © {currentYear} {storeInfo?.name || SITE_NAME}. Tüm hakları saklıdır.
            </p>
            <div className="flex items-center gap-6">
              <Link href="/gizlilik" className="text-neutral-500 text-sm hover:text-white transition-colors">
                Gizlilik
              </Link>
              <Link href="/sartlar" className="text-neutral-500 text-sm hover:text-white transition-colors">
                Şartlar
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
