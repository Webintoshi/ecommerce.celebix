"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import type { CategoryInfo } from "@/types/product";

interface CategoryCard {
  id: string | number;
  name: string;
  subtitle: string;
  description: string;
  link: string;
  image?: string;
  size?: "large" | "medium" | "small";
}

const fallbackCategories: CategoryCard[] = [
  {
    id: 1,
    name: "Apple Watch",
    subtitle: "Deri Kayislar",
    description: "Zamana meydan okuyan siklik",
    image: "/hero-banner-fistik-ezmeleri.jpg",
    link: "/kategori/apple-watch-kayislari",
    size: "large",
  },
  {
    id: 2,
    name: "Klasik Saat",
    subtitle: "Kordonlari",
    description: "Geleneksel el isciligi",
    image: "/hero-banner-super-gidalar-mobile.jpg",
    link: "/kategori/klasik-saat-kordonlari",
    size: "medium",
  },
  {
    id: 3,
    name: "Kisisellestir",
    subtitle: "Ozel Tasarim",
    description: "Kendi hikayeni yaz",
    image: "/Findik_Ezmeleri_Kategorisi.webp",
    link: "/koleksiyon/kisisellestir",
    size: "medium",
  },
  {
    id: 4,
    name: "Hediye",
    subtitle: "Setleri",
    description: "Anlamli jestler",
    image: "/fistik_ezmesi_kategori_gorsel.webp",
    link: "/koleksiyon/hediye-setleri",
    size: "small",
  },
];

interface CategoriesSectionProps {
  initialCategories?: CategoryInfo[];
}

export function CategoriesSection({ initialCategories = [] }: CategoriesSectionProps) {
  const normalizedCategories: CategoryCard[] =
    initialCategories.length > 0
      ? initialCategories.map((category) => ({
          id: category.id,
          name: category.name,
          subtitle: category.productCount > 0 ? `${category.productCount} Urun` : "Koleksiyon",
          description:
            category.description?.trim() ||
            "Bu koleksiyon admin panelinden guncellenen kategori verilerini kullanir.",
          link: ROUTES.category(category.slug),
        }))
      : [];

  const displayCategories = [...normalizedCategories, ...fallbackCategories].slice(0, 4);

  return (
    <section className="bg-[#FAFAFA] py-24 lg:py-32">
      <div className="container-premium">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center lg:mb-24"
        >
          <span className="mb-6 inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.3em] text-[#8A6B37]">
            <span className="h-px w-8 bg-[#8A6B37]" />
            Kategoriler
            <span className="h-px w-8 bg-[#8A6B37]" />
          </span>
          <h2 className="mb-6 font-serif text-4xl text-[#0F1626] md:text-5xl lg:text-6xl">
            Koleksiyonlarimiz
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-[#0F1626]/60">
            Her biri ozenle secilmis deri urunlerimiz arasindan kendi tarzina uygun olanı bul.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-7 lg:row-span-2"
          >
            <Link
              href={displayCategories[0].link}
              className="group relative block h-full min-h-[400px] overflow-hidden bg-[#0F1626] lg:min-h-[600px]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#1A2332] to-[#0F1626]" />
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%238A6B37' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                }}
              />

              <div className="absolute inset-0 flex flex-col justify-between p-8 lg:p-12">
                <div>
                  <span className="text-xs uppercase tracking-[0.3em] text-[#8A6B37]">
                    One Cikan
                  </span>
                </div>

                <div>
                  <h3 className="mb-2 font-serif text-4xl text-white lg:text-5xl">
                    {displayCategories[0].name}
                  </h3>
                  <p className="mb-4 text-xl text-[#8A6B37] lg:text-2xl">
                    {displayCategories[0].subtitle}
                  </p>
                  <p className="mb-8 max-w-sm text-white/60">{displayCategories[0].description}</p>

                  <span className="inline-flex items-center gap-2 text-white transition-colors group-hover:text-[#8A6B37]">
                    <span className="text-sm uppercase tracking-wider">Kesfet</span>
                    <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
                  </span>
                </div>
              </div>

              <div className="absolute inset-0 border-2 border-transparent transition-colors duration-500 group-hover:border-[#8A6B37]/30" />
            </Link>
          </motion.div>

          {displayCategories.slice(1, 3).map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
              className="lg:col-span-5"
            >
              <Link
                href={category.link}
                className="group relative block h-full min-h-[280px] overflow-hidden border border-[#E5E2DE] bg-white transition-colors duration-300 hover:border-[#8A6B37]/30"
              >
                <div className="absolute inset-0 flex flex-col justify-between p-8">
                  <div className="flex items-start justify-between">
                    <span className="text-xs uppercase tracking-[0.3em] text-[#8A6B37]">
                      0{index + 2}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E2DE] transition-all duration-300 group-hover:border-[#8A6B37] group-hover:bg-[#8A6B37]">
                      <ArrowUpRight className="h-5 w-5 text-[#0F1626] transition-colors group-hover:text-white" />
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-1 font-serif text-2xl text-[#0F1626] lg:text-3xl">
                      {category.name}
                    </h3>
                    <p className="mb-2 text-lg text-[#8A6B37]">{category.subtitle}</p>
                    <p className="text-sm text-[#0F1626]/50">{category.description}</p>
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 h-1 w-0 bg-[#8A6B37] transition-all duration-500 group-hover:w-full" />
              </Link>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="lg:col-span-12"
          >
            <Link
              href={displayCategories[3].link}
              className="group relative block overflow-hidden bg-[#0F1626]"
            >
              <div className="grid lg:grid-cols-2">
                <div className="flex flex-col justify-center p-8 lg:p-12">
                  <span className="mb-4 text-xs uppercase tracking-[0.3em] text-[#8A6B37]">
                    Ozel
                  </span>
                  <h3 className="mb-2 font-serif text-3xl text-white lg:text-4xl">
                    {displayCategories[3].name}
                  </h3>
                  <p className="mb-4 text-xl text-[#8A6B37]">{displayCategories[3].subtitle}</p>
                  <p className="mb-6 text-white/60">{displayCategories[3].description}</p>
                  <span className="inline-flex items-center gap-2 text-white transition-colors group-hover:text-[#8A6B37]">
                    <span className="text-sm uppercase tracking-wider">Incele</span>
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </div>
                <div className="relative hidden h-64 bg-gradient-to-br from-[#1A2332] to-[#0F1626] lg:block">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-32 w-32 items-center justify-center rounded-full border border-[#8A6B37]/20">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8A6B37]/10">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-10 w-10 text-[#8A6B37]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
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
