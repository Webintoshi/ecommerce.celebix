"use client";

import Link from "next/link";
import Image from "next/image";
import { ROUTES } from "@/lib/constants";
import type { CategoryInfo } from "@/types/product";

interface CategoryCard {
  id: string | number;
  name: string;
  subtitle: string;
  link: string;
  image?: string;
}

const fallbackCategories: CategoryCard[] = [
  {
    id: 1,
    name: "Apple Watch Kayışları",
    subtitle: "Deri",
    image: "/hero-banner-fistik-ezmeleri.jpg",
    link: "/kategori/apple-watch-kayislari",
  },
  {
    id: 2,
    name: "Saat Kordonları",
    subtitle: "Klasik",
    image: "/hero-banner-super-gidalar-mobile.jpg",
    link: "/kategori/klasik-saat-kordonlari",
  },
  {
    id: 3,
    name: "Aksesuarlar",
    subtitle: "Deri",
    image: "/Findik_Ezmeleri_Kategorisi.webp",
    link: "/koleksiyon/aksesuarlar",
  },
  {
    id: 4,
    name: "Hediye Setleri",
    subtitle: "Özel",
    image: "/fistik_ezmesi_kategori_gorsel.webp",
    link: "/koleksiyon/hediye-setleri",
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
          subtitle: "Koleksiyon",
          link: ROUTES.category(category.slug),
        }))
      : [];

  const displayCategories = [...normalizedCategories, ...fallbackCategories].slice(0, 4);

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="container-premium">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <p className="text-sm uppercase tracking-[0.2em] text-neutral-500 mb-3">
            Koleksiyonlar
          </p>
          <h2 className="text-3xl lg:text-4xl font-serif font-medium text-neutral-900">
            Kategoriler
          </h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {displayCategories.map((category) => (
            <Link
              key={category.id}
              href={category.link}
              className="group block"
            >
              <div className="relative aspect-[3/4] bg-neutral-100 mb-4 overflow-hidden">
                {category.image ? (
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-neutral-400">
                    {category.name}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">
                  {category.subtitle}
                </p>
                <h3 className="font-medium text-neutral-900 group-hover:text-neutral-600 transition-colors">
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
