"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Instagram, Mail, MapPin, Phone, Truck, Shield, Clock, Award } from "lucide-react";
import {
  CONTACT_INFO,
  FOOTER_LINKS,
  SITE_DESCRIPTION,
  SITE_NAME,
  SOCIAL_LINKS,
} from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { useState } from "react";

// Trust badges data
const trustBadges = [
  { icon: Truck, label: "Ücretsiz Kargo", sublabel: "500 TL üzeri" },
  { icon: Shield, label: "Güvenli Alışveriş", sublabel: "256-bit SSL" },
  { icon: Clock, label: "Hızlı Teslimat", sublabel: "1-3 iş günü" },
  { icon: Award, label: "El Yapımı", sublabel: "%100 Hakiki Deri" },
];

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const logoSrc = storeInfo?.logoUrl || "";
  const logoAlt = storeInfo?.name || SITE_NAME;

  const contactInfo = {
    email: storeInfo?.email || CONTACT_INFO.email,
    phone: storeInfo?.phone || CONTACT_INFO.phone,
    address: storeInfo?.address || "İstanbul, Türkiye",
  };

  const socialLinks = {
    instagram: storeInfo?.socialInstagram || SOCIAL_LINKS.instagram,
  };

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
    }
  };

  return (
    <footer className="bg-[#0F1626]">
      {/* Trust Badges Bar */}
      <div className="border-b border-white/10">
        <div className="container-premium py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {trustBadges.map((badge, index) => (
              <div 
                key={index} 
                className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-[#8A6B37]/20 flex items-center justify-center flex-shrink-0">
                  <badge.icon className="h-5 w-5 text-[#8A6B37]" />
                </div>
                <div>
                  <p className="font-medium text-white text-sm">{badge.label}</p>
                  <p className="text-white/50 text-xs">{badge.sublabel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="container-premium py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-4">
            <Link href="/" className="inline-block mb-6">
              {logoSrc ? (
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  width={180}
                  height={60}
                  className="h-12 w-auto"
                  sizes="180px"
                  unoptimized
                />
              ) : null}
              <span className={`${logoSrc ? "hidden " : ""}font-serif text-2xl font-semibold text-white`}>
                DERİ <span className="text-[#8A6B37]">KORDON</span>
              </span>
            </Link>
            <p className="text-white/60 text-sm leading-relaxed mb-6 max-w-sm">
              {SITE_DESCRIPTION}
            </p>
            
            {/* Social Links */}
            <div className="flex items-center gap-3">
              <a
                href={socialLinks.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:bg-[#8A6B37] hover:text-white transition-all"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Navigation Columns */}
          <div className="lg:col-span-2">
            <h4 className="text-white font-medium mb-4 text-sm tracking-wide uppercase">
              Keşfet
            </h4>
            <ul className="space-y-3">
              {FOOTER_LINKS.discover.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-white/60 text-sm hover:text-[#8A6B37] transition-colors"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="text-white font-medium mb-4 text-sm tracking-wide uppercase">
              Kurumsal
            </h4>
            <ul className="space-y-3">
              {FOOTER_LINKS.company.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-white/60 text-sm hover:text-[#8A6B37] transition-colors"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="text-white font-medium mb-4 text-sm tracking-wide uppercase">
              Politikalar
            </h4>
            <ul className="space-y-3">
              {FOOTER_LINKS.policies.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-white/60 text-sm hover:text-[#8A6B37] transition-colors"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact & Newsletter Column */}
          <div className="lg:col-span-2">
            <h4 className="text-white font-medium mb-4 text-sm tracking-wide uppercase">
              İletişim
            </h4>
            <ul className="space-y-4 mb-6">
              <li>
                <a
                  href={`mailto:${contactInfo.email}`}
                  className="flex items-center gap-3 text-white/60 text-sm hover:text-[#8A6B37] transition-colors"
                >
                  <Mail className="h-4 w-4 text-[#8A6B37]" />
                  <span className="break-all">{contactInfo.email}</span>
                </a>
              </li>
              <li>
                <a
                  href={`tel:${contactInfo.phone}`}
                  className="flex items-center gap-3 text-white/60 text-sm hover:text-[#8A6B37] transition-colors"
                >
                  <Phone className="h-4 w-4 text-[#8A6B37]" />
                  <span>{contactInfo.phone}</span>
                </a>
              </li>
              <li>
                <div className="flex items-start gap-3 text-white/60 text-sm">
                  <MapPin className="h-4 w-4 text-[#8A6B37] mt-0.5" />
                  <span>{contactInfo.address}</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Newsletter Section */}
        <div className="mt-12 pt-10 border-t border-white/10">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h4 className="text-white font-serif text-xl mb-2">
                Özel Fırsatları Kaçırma
              </h4>
              <p className="text-white/60 text-sm">
                İlk siparişinde %10 indirim kazanmak için e-bültenimize abone ol.
              </p>
            </div>
            <div>
              {subscribed ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-[#8A6B37]/20">
                  <div className="w-8 h-8 rounded-full bg-[#8A6B37] flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-white font-medium">Aboneliğiniz için teşekkürler!</span>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="flex gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-posta adresiniz"
                    required
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#8A6B37] transition-colors"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 bg-[#8A6B37] text-white font-medium rounded-lg hover:bg-[#8A6B37]/90 transition-colors flex items-center gap-2"
                  >
                    Abone Ol
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="container-premium py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-sm">
              © {currentYear} {SITE_NAME}. Tüm hakları saklıdır.
            </p>
            <div className="flex items-center gap-6">
              <Link href="/gizlilik" className="text-white/40 text-sm hover:text-white/60 transition-colors">
                Gizlilik
              </Link>
              <Link href="/sartlar" className="text-white/40 text-sm hover:text-white/60 transition-colors">
                Kullanım Şartları
              </Link>
              <Link href="/iletisim" className="text-white/40 text-sm hover:text-white/60 transition-colors">
                İletişim
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
