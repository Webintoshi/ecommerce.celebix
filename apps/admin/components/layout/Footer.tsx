"use client";

import Link from "next/link";
import Image from "next/image";
import { 
  Mail, 
  Phone, 
  Instagram,
  ArrowRight
} from "lucide-react";
import { SITE_NAME, CONTACT_INFO, SOCIAL_LINKS } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const currentYear = new Date().getFullYear();

  const contactInfo = storeInfo ? {
    email: storeInfo.email || CONTACT_INFO.email,
    phone: storeInfo.phone || CONTACT_INFO.phone,
    address: storeInfo.address || CONTACT_INFO.address,
  } : CONTACT_INFO;

  const socialLinks = storeInfo ? {
    instagram: storeInfo.socialInstagram || SOCIAL_LINKS.instagram,
    facebook: SOCIAL_LINKS.facebook,
    twitter: storeInfo.socialTwitter || SOCIAL_LINKS.twitter,
  } : SOCIAL_LINKS;

  return (
    <footer className="bg-[#fafafa] border-t border-gray-200">
      {/* Main Footer */}
      <div className="container mx-auto px-4 py-10 md:py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-y-6 gap-x-8 lg:gap-8">
          
          {/* Brand Column */}
          <div className="lg:col-span-4">
            <Link href="/" className="inline-block mb-5">
              <Image 
                src="/logo.webp" 
                alt={SITE_NAME} 
                width={110}
                height={40}
                className="h-10 w-auto"
                sizes="110px"
              />
            </Link>
            <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-xs">
              %100 doğal, katkısız fıstık ezmeleri ve kuruyemişler.
            </p>
            
            {/* Social Links */}
            <div className="flex gap-3">
              <a
                href={socialLinks.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:border-[#7B1113] hover:bg-[#7B1113] hover:text-white text-gray-600 flex items-center justify-center transition-all duration-300 shadow-sm"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href={socialLinks.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:border-[#7B1113] hover:bg-[#7B1113] hover:text-white text-gray-600 flex items-center justify-center transition-all duration-300 shadow-sm"
                aria-label="Facebook"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a
                href={socialLinks.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:border-[#7B1113] hover:bg-[#7B1113] hover:text-white text-gray-600 flex items-center justify-center transition-all duration-300 shadow-sm"
                aria-label="Twitter"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Links */}
          <div className="lg:col-span-2">
            <h4 className="font-semibold text-sm text-gray-900 mb-4 lg:mb-5">Ürünler</h4>
            <ul className="space-y-2 lg:space-y-3">
              <li><Link href="/urunler" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">Tüm Ürünler</Link></li>
              <li><Link href="/kategori/fistik-ezmesi" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">Fıstık Ezmeleri</Link></li>
              <li><Link href="/kategori/findik-ezmesi" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">Fındık Ezmeleri</Link></li>
              <li><Link href="/kategori/kuruyemis" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">Kuruyemişler</Link></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="font-semibold text-sm text-gray-900 mb-4 lg:mb-5">Kurumsal</h4>
            <ul className="space-y-2 lg:space-y-3">
              <li><Link href="/hakkimizda" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">Hakkımızda</Link></li>
              <li><Link href="/blog" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">Blog</Link></li>
              <li><Link href="/iletisim" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">İletişim</Link></li>
              <li><Link href="/sss" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">SSS</Link></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="font-semibold text-sm text-gray-900 mb-4 lg:mb-5">Yardım</h4>
            <ul className="space-y-2 lg:space-y-3">
              <li><Link href="/kargo" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">Kargo & Teslimat</Link></li>
              <li><Link href="/iade" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">İade & Değişim</Link></li>
              <li><Link href="/gizlilik" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">Gizlilik Politikası</Link></li>
              <li><Link href="/sartlar" className="text-gray-500 hover:text-[#7B1113] text-sm transition-colors">Hizmet Şartları</Link></li>
            </ul>
          </div>

          {/* Contact & Newsletter */}
          <div className="lg:col-span-2">
            <h4 className="font-semibold text-sm text-gray-900 mb-4 lg:mb-5">İletişim</h4>
            <ul className="space-y-3 lg:space-y-4 mb-6 lg:mb-8">
              <li>
                <a href={`mailto:${contactInfo.email}`} className="flex items-center gap-3 text-gray-500 hover:text-[#7B1113] text-sm transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center group-hover:border-[#7B1113] transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  <span className="break-all">{contactInfo.email}</span>
                </a>
              </li>
              <li>
                <a href={`tel:${contactInfo.phone}`} className="flex items-center gap-3 text-gray-500 hover:text-[#7B1113] text-sm transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center group-hover:border-[#7B1113] transition-colors">
                    <Phone className="w-4 h-4" />
                  </div>
                  <span>{contactInfo.phone}</span>
                </a>
              </li>
            </ul>

            {/* Modern Newsletter */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <p className="text-sm font-medium text-gray-900 mb-3">%10 İndirim Kazan</p>
              <div className="relative">
                <input
                  type="email"
                  placeholder="E-posta adresin"
                  className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#7B1113] focus:ring-1 focus:ring-[#7B1113] transition-all"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#7B1113] text-white rounded-lg hover:bg-[#5d0e0f] transition-colors flex items-center justify-center">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-200">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Copyright */}
            <p className="text-sm text-gray-400">
              © {currentYear} {SITE_NAME}. Tüm hakları saklıdır.
            </p>
            
            {/* Payment Methods */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 mr-2">Güvenli Ödeme</span>
              <span className="px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs font-semibold text-gray-600">VISA</span>
              <span className="px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs font-semibold text-gray-600">MC</span>
              <span className="px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs font-semibold text-gray-600">AMEX</span>
            </div>

            {/* Webintosh Signature */}
            <a 
              href="https://webintoshi.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900 hover:bg-gray-800 transition-all"
            >
              <div className="flex flex-col items-end">
                <span className="text-[5px] font-medium tracking-widest text-gray-400 uppercase leading-none">Designed by</span>
                <span className="text-[9px] font-bold tracking-[0.15em] text-white leading-none">WEBINTOSH</span>
              </div>
              <div className="relative w-4 h-4 flex-shrink-0">
                <Image
                  src="/webintosh logo.svg"
                  alt="Webintosh"
                  fill
                  className="object-contain brightness-0 invert"
                  sizes="16px"
                />
              </div>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
