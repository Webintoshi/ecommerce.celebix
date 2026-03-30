"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Instagram, Facebook, Youtube, Send } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const [email, setEmail] = useState("");
  const currentYear = new Date().getFullYear();
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Subscribe:", email);
    setEmail("");
  };

  // Blog/Help links (first column)
  const blogLinks = [
    { name: "Blog", href: "/blog" },
    { name: "İletişim", href: "/iletisim" },
    { name: "Garanti & İade", href: "/iade" },
    { name: "Ödeme & Teslimat", href: "/kargo" },
    { name: "E-bültene Kaydol!", href: "#" },
    { name: "Sitemap", href: "/sitemap.xml" },
  ];

  // Corporate links (second column)
  const corporateLinks = [
    { name: "Hakkımızda", href: "/hakkimizda" },
    { name: "Kurumsal Hediyeler", href: "#" },
    { name: "Aydınlatma Metni ve Gizlilik Politikası", href: "/gizlilik" },
    { name: "Taklit ve Dolandırıcılık İhbarı", href: "#" },
    { name: "Hizmet Şartları", href: "/sartlar" },
    { name: "Ekibe Katıl", href: "#" },
  ];

  return (
    <footer className="bg-[#0a1628] text-white">
      <div className="container-premium py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8">
          {/* Column 1: Brand Story */}
          <div className="lg:col-span-3">
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
                <span className="font-serif text-xl font-medium">
                  {logoAlt}
                </span>
              )}
            </Link>
            
            <h3 className="text-xs uppercase tracking-[0.3em] text-white/80 mb-4">
              2016&apos;DAN BERİ!
            </h3>
            <p className="text-white/70 text-sm leading-relaxed italic">
              Modern dünya insanları için geleneksel el işçiliği ile yüksek kalitede, kullanışlı ve tarz deri ürünler üretiyoruz.
            </p>
          </div>

          {/* Column 2: Blog Links */}
          <div className="lg:col-span-2 lg:col-start-5">
            <ul className="space-y-3">
              {blogLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-white/70 text-sm hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Corporate Links */}
          <div className="lg:col-span-3">
            <ul className="space-y-3">
              {corporateLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-white/70 text-sm hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Newsletter & Social */}
          <div className="lg:col-span-3">
            <h3 className="text-xs uppercase tracking-[0.3em] text-white/80 mb-4">
              BİZİ TAKİP ET!
            </h3>
            <p className="text-white/70 text-sm mb-6">
              E-bültene katılarak gelişmelerden ve kampanyalardan anında haberdar ol.
            </p>

            {/* Newsletter Form */}
            <form onSubmit={handleSubscribe} className="mb-8">
              <div className="relative border-b border-white/30 focus-within:border-white/60 transition-colors">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Eposta adresini gir"
                  className="w-full bg-transparent py-2 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-white/60 hover:text-white transition-colors"
                  aria-label="Abone ol"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Social Icons */}
            <div className="flex items-center gap-4">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-white transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-6 h-6" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-white transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="w-6 h-6" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-white transition-colors"
                aria-label="YouTube"
              >
                <Youtube className="w-6 h-6" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-white/10">
        <div className="container-premium py-6">
          <p className="text-white/40 text-sm text-center">
            © {currentYear} {storeInfo?.name || SITE_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
