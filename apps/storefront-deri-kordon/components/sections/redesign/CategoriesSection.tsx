"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Watch, CircleDot, Smartphone, Wallet, Ribbon, Box } from "lucide-react";
import { motion } from "framer-motion";
import { CategoryInfo } from "@/types/product";
import { ROUTES } from "@/lib/constants";
import { fetchCategories } from "@/lib/categories";

interface CategoriesSectionProps {
  initialCategories?: CategoryInfo[];
}

// Default categories with Lucide icons - 6 items for 3x2 grid
const defaultCategories = [
  {
    id: "1",
    slug: "apple-watch",
    name: "Apple Watch",
    description: "Hakiki deri kayışlar",
    icon: Watch,
    productCount: 24,
  },
  {
    id: "2",
    slug: "deri-bileklik",
    name: "Deri Bileklik",
    description: "El yapımı bileklikler",
    icon: CircleDot,
    productCount: 18,
  },
  {
    id: "3",
    slug: "akilli-saat",
    name: "Akıllı Saat",
    description: "Tüm modellere uyumlu",
    icon: Smartphone,
    productCount: 32,
  },
  {
    id: "4",
    slug: "deri-cuzdan",
    name: "Deri Cüzdan",
    description: "El yapımı cüzdanlar",
    icon: Wallet,
    productCount: 15,
  },
  {
    id: "5",
    slug: "deri-kemer",
    name: "Deri Kemer",
    description: "Klasik kemerler",
    icon: Ribbon,
    productCount: 12,
  },
  {
    id: "6",
    slug: "saat-kutusu",
    name: "Saat Kutusu",
    description: "Özel tasarım kutular",
    icon: Box,
    productCount: 8,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

export function CategoriesSection({ initialCategories }: CategoriesSectionProps) {
  const [categories, setCategories] = useState<CategoryInfo[]>(initialCategories || []);
  const [loading, setLoading] = useState(!initialCategories);

  useEffect(() => {
    if (initialCategories) {
      setCategories(initialCategories);
      setLoading(false);
      return;
    }

    async function loadCategories() {
      try {
        const data = await fetchCategories();
        setCategories(data);
      } catch (err) {
        console.error("Failed to load categories:", err);
      } finally {
        setLoading(false);
      }
    }
    loadCategories();
  }, [initialCategories]);

  const displayCategories = categories.length > 0 
    ? categories.slice(0, 6).map((cat, idx) => ({
        id: cat.id,
        slug: cat.slug,
        name: cat.name,
        description: cat.description || `${cat.productCount || 0} ürün`,
        icon: defaultCategories[idx % defaultCategories.length].icon,
        productCount: cat.productCount || 0,
      }))
    : defaultCategories;

  return (
    <section className="py-16 lg:py-24 bg-[#F8F8F8]">
      <div className="container-premium">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 lg:mb-16"
        >
          <span className="inline-block text-[#8A6B37] text-xs font-medium tracking-widest uppercase mb-3">
            Kategoriler
          </span>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-[#0F1626] mb-4">
            Koleksiyonumuz
          </h2>
          <p className="text-[#0F1626]/60 max-w-2xl mx-auto">
            Her biri ustaların ellerinden çıkmış, özenle seçilmiş deri ürünler
          </p>
        </motion.div>

        {/* Categories Grid - 3x2 Layout with Fixed 300x400px Size */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="flex flex-wrap justify-center gap-6 lg:gap-8"
        >
          {displayCategories.map((category, index) => {
            const IconComponent = category.icon;
            return (
              <motion.div
                key={category.id}
                variants={itemVariants}
                className="group"
              >
                <Link href={ROUTES.category(category.slug)}>
                  {/* Card Container - Fixed 300x400px */}
                  <div 
                    className="relative w-[300px] h-[400px] bg-[#0F1626] rounded-xl lg:rounded-2xl overflow-hidden hover:bg-[#1a2332] transition-colors duration-300"
                  >
                    
                    {/* Content */}
                    <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center">
                      {/* Icon */}
                      <div className="w-20 h-20 rounded-full bg-[#8A6B37]/20 flex items-center justify-center mb-6 group-hover:bg-[#8A6B37]/30 transition-colors">
                        <IconComponent className="w-10 h-10 text-[#8A6B37]" />
                      </div>
                      
                      {/* Title */}
                      <h3 className="font-serif font-semibold text-white text-2xl mb-2">
                        {category.name}
                      </h3>
                      
                      {/* Description */}
                      <p className="text-white/60 text-base mb-4">
                        {category.description}
                      </p>
                      
                      {/* Product Count */}
                      <span className="inline-block text-[#8A6B37] text-xs font-medium tracking-wider uppercase mb-6">
                        {category.productCount} Ürün
                      </span>

                      {/* CTA Button */}
                      <div className="flex items-center gap-2 text-[#8A6B37] text-sm font-medium opacity-0 transform translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                        <span>Keşfet</span>
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Hover Arrow - Top Right */}
                    <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                      <ArrowUpRight className="w-5 h-5 text-white" />
                    </div>

                    {/* Bottom Accent Line */}
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-[#8A6B37] transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        {/* View All Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-10 lg:mt-12"
        >
          <Link
            href={ROUTES.products}
            className="inline-flex items-center gap-2 px-8 py-4 border border-[#0F1626] text-[#0F1626] font-medium rounded-lg hover:bg-[#0F1626] hover:text-white transition-all"
          >
            Tüm Kategoriler
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
