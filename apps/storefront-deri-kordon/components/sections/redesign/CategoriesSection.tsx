"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

const categories = [
  {
    id: 1,
    name: "Apple Watch",
    subtitle: "Deri Kayışlar",
    description: "Zamana meydan okuyan şıklık",
    image: "/hero-banner-fistik-ezmeleri.jpg",
    link: "/kategori/apple-watch-kayislari",
    size: "large",
  },
  {
    id: 2,
    name: "Klasik Saat",
    subtitle: "Kordonları",
    description: "Geleneksel el işçiliği",
    image: "/hero-banner-super-gidalar-mobile.jpg",
    link: "/kategori/klasik-saat-kordonlari",
    size: "medium",
  },
  {
    id: 3,
    name: "Kişiselleştir",
    subtitle: "Özel Tasarım",
    description: "Kendi hikayeni yaz",
    image: "/Findik_Ezmeleri_Kategorisi.webp",
    link: "/koleksiyon/kisisellestir",
    size: "medium",
  },
  {
    id: 4,
    name: "Hediye",
    subtitle: "Setleri",
    description: "Anlamlı jestler",
    image: "/fistik_ezmesi_kategori_gorsel.webp",
    link: "/koleksiyon/hediye-setleri",
    size: "small",
  },
];

export function CategoriesSection() {
  return (
    <section className="py-24 lg:py-32 bg-[#FAFAFA]">
      <div className="container-premium">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 lg:mb-24"
        >
          <span className="inline-flex items-center gap-3 text-[#8A6B37] text-xs font-medium tracking-[0.3em] uppercase mb-6">
            <span className="w-8 h-px bg-[#8A6B37]" />
            Kategoriler
            <span className="w-8 h-px bg-[#8A6B37]" />
          </span>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl text-[#0F1626] mb-6">
            Koleksiyonlarımız
          </h2>
          <p className="text-[#0F1626]/60 text-lg max-w-2xl mx-auto">
            Her biri özenle seçilmiş deri ürünlerimiz arasından kendi tarzınıza uygun olanı bulun
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* Large Item */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-7 lg:row-span-2"
          >
            <Link href={categories[0].link} className="group block relative h-full min-h-[400px] lg:min-h-[600px] overflow-hidden bg-[#0F1626]">
              {/* Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#1A2332] to-[#0F1626]" />
              
              {/* Pattern Overlay */}
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%238A6B37' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }} />

              {/* Content */}
              <div className="absolute inset-0 p-8 lg:p-12 flex flex-col justify-between">
                <div>
                  <span className="text-[#8A6B37] text-xs tracking-[0.3em] uppercase">Öne Çıkan</span>
                </div>
                
                <div>
                  <h3 className="font-serif text-4xl lg:text-5xl text-white mb-2">{categories[0].name}</h3>
                  <p className="text-[#8A6B37] text-xl lg:text-2xl mb-4">{categories[0].subtitle}</p>
                  <p className="text-white/60 max-w-sm mb-8">{categories[0].description}</p>
                  
                  <span className="inline-flex items-center gap-2 text-white group-hover:text-[#8A6B37] transition-colors">
                    <span className="text-sm tracking-wider uppercase">Keşfet</span>
                    <ArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                  </span>
                </div>
              </div>

              {/* Hover Effect */}
              <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#8A6B37]/30 transition-colors duration-500" />
            </Link>
          </motion.div>

          {/* Medium Items */}
          {categories.slice(1, 3).map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
              className="lg:col-span-5"
            >
              <Link href={category.link} className="group block relative h-full min-h-[280px] overflow-hidden bg-white border border-[#E5E2DE] hover:border-[#8A6B37]/30 transition-colors duration-300">
                <div className="absolute inset-0 p-8 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <span className="text-[#8A6B37] text-xs tracking-[0.3em] uppercase">0{category.id}</span>
                    <div className="w-10 h-10 rounded-full border border-[#E5E2DE] flex items-center justify-center group-hover:border-[#8A6B37] group-hover:bg-[#8A6B37] transition-all duration-300">
                      <ArrowUpRight className="w-5 h-5 text-[#0F1626] group-hover:text-white transition-colors" />
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-serif text-2xl lg:text-3xl text-[#0F1626] mb-1">{category.name}</h3>
                    <p className="text-[#8A6B37] text-lg mb-2">{category.subtitle}</p>
                    <p className="text-[#0F1626]/50 text-sm">{category.description}</p>
                  </div>
                </div>

                {/* Decorative Line */}
                <div className="absolute bottom-0 left-0 w-0 h-1 bg-[#8A6B37] group-hover:w-full transition-all duration-500" />
              </Link>
            </motion.div>
          ))}

          {/* Small Item - Full Width */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="lg:col-span-12"
          >
            <Link href={categories[3].link} className="group block relative overflow-hidden bg-[#0F1626]">
              <div className="grid lg:grid-cols-2">
                <div className="p-8 lg:p-12 flex flex-col justify-center">
                  <span className="text-[#8A6B37] text-xs tracking-[0.3em] uppercase mb-4">Özel</span>
                  <h3 className="font-serif text-3xl lg:text-4xl text-white mb-2">{categories[3].name}</h3>
                  <p className="text-[#8A6B37] text-xl mb-4">{categories[3].subtitle}</p>
                  <p className="text-white/60 mb-6">{categories[3].description}</p>
                  <span className="inline-flex items-center gap-2 text-white group-hover:text-[#8A6B37] transition-colors">
                    <span className="text-sm tracking-wider uppercase">İncele</span>
                    <ArrowUpRight className="w-5 h-5" />
                  </span>
                </div>
                <div className="hidden lg:block relative h-64 bg-gradient-to-br from-[#1A2332] to-[#0F1626]">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 rounded-full border border-[#8A6B37]/20 flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-[#8A6B37]/10 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-10 h-10 text-[#8A6B37]" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="8" width="18" height="4" rx="1" />
                          <rect x="5" y="5" width="14" height="3" rx="1" />
                          <rect x="5" y="12" width="14" height="3" rx="1" />
                          <path d="M8 17v2M16 17v2" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
