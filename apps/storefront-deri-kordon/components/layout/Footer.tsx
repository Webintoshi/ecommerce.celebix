"use client";

import Link from "next/link";
import { Instagram, Youtube } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const currentYear = new Date().getFullYear();

  const aboutLinks = [
    { name: "Ana Sayfa", href: "/" },
    { name: "Hakkımızda", href: "/hakkimizda" },
    { name: "Mağazalarımız", href: "/magazalarimiz" },
    { name: "Kurumsal Sipariş", href: "/kurumsal-urunler" },
    { name: "İletişim", href: "/iletisim" },
  ];

  const categoryLinks = [
    { name: "CÜZDAN & KARTLIK", href: "/kategori/cuzdan-kartlik" },
    { name: "APPLE WATCH KAYIŞLARI", href: "/kategori/apple-watch-kayislari" },
    { name: "SAAT KAYIŞLARI", href: "/kategori/saat-kayislari" },
    { name: "ÇANTA & ORGANİZER", href: "/kategori/canta-organizer" },
    { name: "AKSESUAR", href: "/kategori/aksesuar" },
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
            {/* Logo - Handwritten Style */}
            <Link href="/" className="inline-block mb-6">
              <span className="text-3xl font-light tracking-wide" style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}>
                DeryCraft
              </span>
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
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-5">
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
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-5">
              KATEGORİLER
            </h3>
            <ul className="space-y-3">
              {categoryLinks.map((link) => (
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

          {/* Policies Column */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-5">
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
          <p className="text-center text-xs text-gray-500">
            © {currentYear} {storeInfo?.name || SITE_NAME}. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </footer>
  );
}
