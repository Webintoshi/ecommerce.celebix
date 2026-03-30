"use client";

import Link from "next/link";
import Image from "next/image";
import { ROUTES } from "@/lib/constants";
import type { CategoryInfo } from "@/types/product";

interface CategoryCard {
  id: string | number;
  name: string;
  link: string;
  image: string;
}

const categories: CategoryCard[] = [
  {
    id: 1,
    name: "Deri Cüzdan & Kartlık",
    image: "/hero-banner-fistik-ezmeleri.jpg",
    link: "/kategori/deri-cuzdan-kartlik",
  },
  {
    id: 2,
    name: "Deri Aksesuarlar",
    image: "/hero-banner-super-gidalar-mobile.jpg",
    link: "/kategori/deri-aksesuarlar",
  },
  {
    id: 3,
    name: "Çanta & Deri Organizer",
    image: "/Findik_Ezmeleri_Kategorisi.webp",
    link: "/kategori/canta-organizer",
  },
  {
    id: 4,
    name: "Deri Saat Kutusı",
    image: "/fistik_ezmesi_kategori_gorsel.webp",
    link: "/kategori/deri-saat-kutusu",
  },
  {
    id: 5,
    name: "Cep Çakısı",
    image: "/hero-banner-fistik-ezmeleri.jpg",
    link: "/kategori/cep-cakisi",
  },
  {
    id: 6,
    name: "Cam Obje & Biblo",
    image: "/hero-banner-super-gidalar-mobile.jpg",
    link: "/kategori/cam-obje-biblo",
  },
];

interface CategoriesSectionProps {
  initialCategories?: CategoryInfo[];
}

export function CategoriesSection({ initialCategories = [] }: CategoriesSectionProps) {
  // Use API categories if available, otherwise use fallback
  const displayCategories = initialCategories.length > 0
    ? initialCategories.slice(0, 6).map((cat, index) => ({
        id: cat.id,
        name: cat.name,
        link: ROUTES.category(cat.slug),
        image: categories[index % categories.length].image,
      }))
    : categories.slice(0, 6);

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="container-premium">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-400 mb-3">
            KOLEKSİYONLAR
          </p>
          <h2 className="text-3xl lg:text-4xl font-serif font-medium text-neutral-900">
            Kategoriler
          </h2>
        </div>

        {/* Grid - 3 columns, 2 rows, 3:2 ratio */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {displayCategories.map((category) => (
            <Link
              key={category.id}
              href={category.link}
              className="group relative block aspect-[3/2] overflow-hidden"
            >
              {/* Background Image */}
              <Image
                src={category.image}
                alt={category.name}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors duration-300" />
              
              {/* Category Name - Centered */}
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <h3 className="text-white text-lg md:text-xl lg:text-2xl font-medium text-center leading-tight drop-shadow-lg">
                  {category.name}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
