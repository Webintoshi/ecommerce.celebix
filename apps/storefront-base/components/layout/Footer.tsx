"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Instagram, Mail, Phone } from "lucide-react";
import {
  CONTACT_INFO,
  FOOTER_LINKS,
  SITE_DESCRIPTION,
  SITE_LOGO_PATH,
  SITE_NAME,
  SOCIAL_LINKS,
} from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";

function FooterLinkList({
  title,
  items,
}: {
  title: string;
  items: Array<{ name: string; href: string }>;
}) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-semibold text-gray-900">{title}</h4>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="text-sm text-gray-500 transition-colors hover:text-[#7B1113]"
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const currentYear = new Date().getFullYear();
  const logoSrc = storeInfo?.logoUrl || SITE_LOGO_PATH;
  const logoAlt = storeInfo?.name || SITE_NAME;

  const contactInfo = {
    email: storeInfo?.email || CONTACT_INFO.email,
    phone: storeInfo?.phone || CONTACT_INFO.phone,
    address: storeInfo?.address || CONTACT_INFO.address,
  };

  const socialLinks = {
    instagram: storeInfo?.socialInstagram || SOCIAL_LINKS.instagram,
    facebook: SOCIAL_LINKS.facebook,
    twitter: storeInfo?.socialTwitter || SOCIAL_LINKS.twitter,
  };

  return (
    <footer className="border-t border-gray-200 bg-[#faf7f4]">
      <div className="container mx-auto grid gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-12 lg:gap-8 lg:py-20">
        <div className="lg:col-span-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image
              src={logoSrc}
              alt={logoAlt}
              width={150}
              height={52}
              className="h-11 w-auto"
              sizes="150px"
              unoptimized={logoSrc.startsWith("http")}
            />
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-7 text-gray-600">{SITE_DESCRIPTION}</p>

          <div className="mt-6 flex items-center gap-3">
            <a
              href={socialLinks.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-all hover:border-[#7B1113] hover:bg-[#7B1113] hover:text-white"
              aria-label="Instagram"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href={socialLinks.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-all hover:border-[#7B1113] hover:bg-[#7B1113] hover:text-white"
              aria-label="Facebook"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073C24 5.446 18.627.073 12 .073S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
              </svg>
            </a>
            <a
              href={socialLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-all hover:border-[#7B1113] hover:bg-[#7B1113] hover:text-white"
              aria-label="Twitter"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
              </svg>
            </a>
          </div>
        </div>

        <div className="lg:col-span-2">
          <FooterLinkList title="Kesfet" items={FOOTER_LINKS.discover} />
        </div>

        <div className="lg:col-span-2">
          <FooterLinkList title="Kurumsal" items={FOOTER_LINKS.company} />
        </div>

        <div className="lg:col-span-2">
          <FooterLinkList title="Politikalar" items={FOOTER_LINKS.policies} />
        </div>

        <div className="lg:col-span-2">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">Iletisim</h4>
          <ul className="space-y-4">
            <li>
              <a
                href={`mailto:${contactInfo.email}`}
                className="flex items-center gap-3 text-sm text-gray-500 transition-colors hover:text-[#7B1113]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white">
                  <Mail className="h-4 w-4" />
                </span>
                <span className="break-all">{contactInfo.email}</span>
              </a>
            </li>
            <li>
              <a
                href={`tel:${contactInfo.phone}`}
                className="flex items-center gap-3 text-sm text-gray-500 transition-colors hover:text-[#7B1113]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white">
                  <Phone className="h-4 w-4" />
                </span>
                <span>{contactInfo.phone}</span>
              </a>
            </li>
          </ul>

          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-medium text-gray-900">
              E-bulten ve kampanya alani
            </p>
            <div className="relative">
              <input
                type="email"
                placeholder="E-posta adresin"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm transition-all focus:border-[#7B1113] focus:outline-none focus:ring-1 focus:ring-[#7B1113]"
              />
              <button className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-[#7B1113] text-white transition-colors hover:bg-[#5d0e0f]">
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200">
        <div className="container mx-auto flex flex-col gap-4 px-4 py-5 text-sm text-gray-400 md:flex-row md:items-center md:justify-between">
          <p>© {currentYear} {SITE_NAME}. Tum haklari saklidir.</p>
          <p>{contactInfo.address}</p>
        </div>
      </div>
    </footer>
  );
}
