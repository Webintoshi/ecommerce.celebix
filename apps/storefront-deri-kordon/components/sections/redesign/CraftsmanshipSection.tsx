"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

const features = [
  "%100 Hakiki Deri",
  "El Dikişi İşçilik",
  "Kişiselleştirilebilir",
  "Ömür Boyu Garanti",
];

const stats = [
  { value: "15+", label: "Yıllık Deneyim" },
  { value: "50K+", label: "Mutlu Müşteri" },
  { value: "100%", label: "El Yapımı" },
  { value: "24s", label: "Hızlı Teslimat" },
];

export function CraftsmanshipSection() {
  return (
    <section className="py-24 lg:py-32 bg-[#0F1626] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Gold Accent */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#8A6B37]/30 to-transparent" />

      <div className="container-premium relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* Left - Visual */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            {/* Main Frame */}
            <div className="relative aspect-[4/5] bg-gradient-to-br from-[#1A2332] to-[#0F1626] border border-[#8A6B37]/20">
              {/* Inner Content */}
              <div className="absolute inset-8 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-40 h-40 mx-auto mb-6 rounded-full border-2 border-[#8A6B37]/30 flex items-center justify-center">
                    <div className="w-28 h-28 rounded-full bg-[#8A6B37]/10 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-16 h-16 text-[#8A6B37]" fill="none" stroke="currentColor" strokeWidth="1">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-[#8A6B37] text-xs tracking-[0.3em] uppercase">Handcrafted with</p>
                  <p className="font-serif text-3xl text-white mt-2">Passion</p>
                </div>
              </div>

              {/* Corner Accents */}
              <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-[#8A6B37]" />
              <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-[#8A6B37]" />
              <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-[#8A6B37]" />
              <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-[#8A6B37]" />
            </div>

            {/* Floating Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="absolute -bottom-6 -right-6 bg-[#8A6B37] text-white p-6"
            >
              <p className="text-xs tracking-wider uppercase mb-1">Since</p>
              <p className="font-serif text-3xl">2018</p>
            </motion.div>
          </motion.div>

          {/* Right - Content */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-3 text-[#8A6B37] text-xs font-medium tracking-[0.3em] uppercase mb-6">
              <span className="w-8 h-px bg-[#8A6B37]" />
              Zanaat
            </span>
            
            <h2 className="font-serif text-4xl md:text-5xl text-white mb-6 leading-tight">
              Her Dikişte<br />
              <span className="text-[#8A6B37]">Bir Hikaye</span>
            </h2>
            
            <p className="text-white/60 text-lg leading-relaxed mb-8">
              2018&apos;den beri İstanbul&apos;un kalbinde, geleneksel deri işçiliğini modern tasarımla birleştiriyoruz. 
              Her ürünümüz, yılların tecrübesine sahip ustalarımızın ellerinden özenle çıkıyor.
            </p>

            <p className="text-white/40 leading-relaxed mb-10">
              En kaliteli tam tahıl deriyi seçiyor, geleneksel el dikişi teknikleriyle işliyor ve 
              zamanla güzelleşen ürünler yaratıyoruz. Deri, bizim için sadece bir malzeme değil, 
              bir tutku ve yaşam tarzı.
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4 mb-12">
              {features.map((feature, index) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.1 * index }}
                  className="flex items-center gap-3"
                >
                  <div className="w-6 h-6 rounded-full bg-[#8A6B37]/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-[#8A6B37]" />
                  </div>
                  <span className="text-white/80 text-sm">{feature}</span>
                </motion.div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-6 pt-8 border-t border-white/10">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.1 * index }}
                  className="text-center"
                >
                  <p className="font-serif text-2xl md:text-3xl text-[#8A6B37] mb-1">{stat.value}</p>
                  <p className="text-white/40 text-xs">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
