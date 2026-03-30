"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Instagram, Mail, MapPin, Phone, Truck, Shield, Clock, Award, ChevronRight, ArrowUpRight } from "lucide-react";
import {
  CONTACT_INFO,
  FOOTER_LINKS,
  SITE_DESCRIPTION,
  SITE_NAME,
  SOCIAL_LINKS,
} from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useRef } from "react";

// Trust badges data
const trustBadges = [
  { icon: Truck, label: "Ücretsiz Kargo", sublabel: "500 TL üzeri" },
  { icon: Shield, label: "Güvenli Alışveriş", sublabel: "256-bit SSL" },
  { icon: Clock, label: "Hızlı Teslimat", sublabel: "1-3 iş günü" },
  { icon: Award, label: "El Yapımı", sublabel: "%100 Hakiki Deri" },
];

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setIsSubmitting(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSubscribed(true);
      setIsSubmitting(false);
      setEmail("");
    }
  };

  const footerRef = useRef(null);
  const isInView = useInView(footerRef, { once: true, margin: "-100px" });

  return (
    <footer ref={footerRef} className="bg-[#0F1626] relative overflow-hidden">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Trust Badges Bar */}
      <motion.div 
        className="border-b border-white/10"
        initial={{ opacity: 0, y: -20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <div className="container-premium py-8">
          <motion.div 
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            {trustBadges.map((badge, index) => (
              <motion.div 
                key={index} 
                variants={itemVariants}
                className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group cursor-default"
                whileHover={{ scale: 1.02 }}
              >
                <motion.div 
                  className="w-12 h-12 rounded-full bg-[#8A6B37]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#8A6B37]/30 transition-colors"
                  whileHover={{ rotate: 10 }}
                >
                  <badge.icon className="h-5 w-5 text-[#8A6B37]" />
                </motion.div>
                <div>
                  <p className="font-medium text-white text-sm">{badge.label}</p>
                  <p className="text-white/50 text-xs">{badge.sublabel}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Main Footer Content */}
      <div className="container-premium py-16 lg:py-20">
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8"
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
        >
          {/* Brand Column */}
          <motion.div variants={itemVariants} className="lg:col-span-4">
            <Link href="/" className="inline-block mb-6 group">
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
              <span className={`${logoSrc ? "hidden " : ""}font-serif text-2xl font-semibold text-white group-hover:text-[#8A6B37] transition-colors`}>
                DERİ <span className="text-[#8A6B37]">KORDON</span>
              </span>
            </Link>
            <p className="text-white/60 text-sm leading-relaxed mb-6 max-w-sm">
              {SITE_DESCRIPTION}
            </p>
            
            {/* Social Links */}
            <div className="flex items-center gap-3">
              <motion.a
                href={socialLinks.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:bg-[#8A6B37] hover:text-white transition-all"
                aria-label="Instagram"
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
              >
                <Instagram className="h-5 w-5" />
              </motion.a>
            </div>
          </motion.div>

          {/* Navigation Columns */}
          {[
            { title: "Keşfet", links: FOOTER_LINKS.discover },
            { title: "Kurumsal", links: FOOTER_LINKS.company },
            { title: "Politikalar", links: FOOTER_LINKS.policies },
          ].map((column, colIndex) => (
            <motion.div key={column.title} variants={itemVariants} className="lg:col-span-2">
              <h4 className="text-white font-medium mb-4 text-sm tracking-wide uppercase">
                {column.title}
              </h4>
              <ul className="space-y-3">
                {column.links.map((item, linkIndex) => (
                  <motion.li 
                    key={item.href}
                    initial={{ opacity: 0, x: -10 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.3 + colIndex * 0.1 + linkIndex * 0.05 }}
                  >
                    <Link
                      href={item.href}
                      className="group flex items-center gap-2 text-white/60 text-sm hover:text-[#8A6B37] transition-colors"
                    >
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-5 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                      <span>{item.name}</span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          ))}

          {/* Contact Column */}
          <motion.div variants={itemVariants} className="lg:col-span-2">
            <h4 className="text-white font-medium mb-4 text-sm tracking-wide uppercase">
              İletişim
            </h4>
            <ul className="space-y-4 mb-6">
              <li>
                <motion.a
                  href={`mailto:${contactInfo.email}`}
                  className="flex items-center gap-3 text-white/60 text-sm hover:text-[#8A6B37] transition-colors group"
                  whileHover={{ x: 4 }}
                >
                  <Mail className="h-4 w-4 text-[#8A6B37]" />
                  <span className="break-all">{contactInfo.email}</span>
                </motion.a>
              </li>
              <li>
                <motion.a
                  href={`tel:${contactInfo.phone}`}
                  className="flex items-center gap-3 text-white/60 text-sm hover:text-[#8A6B37] transition-colors group"
                  whileHover={{ x: 4 }}
                >
                  <Phone className="h-4 w-4 text-[#8A6B37]" />
                  <span>{contactInfo.phone}</span>
                </motion.a>
              </li>
              <li>
                <motion.div 
                  className="flex items-start gap-3 text-white/60 text-sm"
                  whileHover={{ x: 4 }}
                >
                  <MapPin className="h-4 w-4 text-[#8A6B37] mt-0.5" />
                  <span>{contactInfo.address}</span>
                </motion.div>
              </li>
            </ul>
          </motion.div>
        </motion.div>

        {/* Newsletter Section */}
        <motion.div 
          className="mt-12 pt-10 border-t border-white/10"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h4 className="text-white font-serif text-2xl mb-2">
                Özel Fırsatları Kaçırma
              </h4>
              <p className="text-white/60 text-sm">
                İlk siparişinde %10 indirim kazanmak için e-bültenimize abone ol.
              </p>
            </div>
            <div>
              <AnimatePresence mode="wait">
                {subscribed ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-3 p-4 rounded-xl bg-[#8A6B37]/20"
                  >
                    <motion.div 
                      className="w-10 h-10 rounded-full bg-[#8A6B37] flex items-center justify-center"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    >
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                    <div>
                      <span className="text-white font-medium block">Aboneliğiniz için teşekkürler!</span>
                      <span className="text-white/50 text-sm">İlk fırsatta sizi bilgilendireceğiz.</span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    onSubmit={handleSubscribe}
                    className="flex gap-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex-1 relative">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="E-posta adresiniz"
                        required
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#8A6B37] focus:ring-2 focus:ring-[#8A6B37]/20 transition-all"
                      />
                    </div>
                    <motion.button
                      type="submit"
                      disabled={isSubmitting}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-6 py-3 bg-[#8A6B37] text-white font-medium rounded-lg hover:bg-[#A67C3D] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <motion.div
                          className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                      ) : (
                        <>
                          Abone Ol
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </motion.button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom Bar */}
      <motion.div 
        className="border-t border-white/10"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, delay: 0.7 }}
      >
        <div className="container-premium py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-sm">
              © {currentYear} {SITE_NAME}. Tüm hakları saklıdır.
            </p>
            <div className="flex items-center gap-6">
              {["Gizlilik", "Kullanım Şartları", "İletişim"].map((item) => (
                <motion.div key={item} whileHover={{ y: -2 }}>
                  <Link 
                    href={`/${item.toLowerCase().replace(" ", "-")}`} 
                    className="text-white/40 text-sm hover:text-white/80 transition-colors"
                  >
                    {item}
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Scroll to Top Button */}
      <motion.button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-8 right-8 w-12 h-12 bg-[#8A6B37] text-white rounded-full shadow-lg shadow-[#8A6B37]/30 flex items-center justify-center z-50"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.1, y: -4 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Yukarı kaydır"
      >
        <ArrowUpRight className="w-5 h-5 rotate-[-45deg]" />
      </motion.button>
    </footer>
  );
}
