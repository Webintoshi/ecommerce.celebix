"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface HeroBanner {
  id: number;
  desktop: string;
  mobile?: string;
  alt: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
}

interface HeroSectionProps {
  slides?: HeroBanner[];
  banners?: HeroBanner[];
}

const defaultBanners: HeroBanner[] = [
  {
    id: 1,
    desktop: "/Hero_banner_Bir.jpg",
    mobile: "/hero-banner-fistik-ezmeleri-mobile.jpg",
    alt: "Premium Deri Ürünler",
    title: "El Yapımı Deri",
    subtitle: "Hakiki deri, zamana meydan okuyan şıklık",
    buttonText: "Koleksiyon",
    buttonLink: "/urunler",
  },
];

export function HeroSection({ slides, banners }: HeroSectionProps) {
  const [current, setCurrent] = useState(0);
  
  const heroBanners =
    (slides && slides.length > 0 ? slides : null) ||
    (banners && banners.length > 0 ? banners : null) ||
    defaultBanners;

  const currentBanner = heroBanners[current];
  const desktopSrc = resolveStorefrontAssetUrl(
    currentBanner.desktop || currentBanner.mobile || defaultBanners[0].desktop
  );
  const mobileSrc = resolveStorefrontAssetUrl(
    currentBanner.mobile || currentBanner.desktop || defaultBanners[0].mobile || desktopSrc
  );
  const usesProxiedDesktopImage = isProxiedStorefrontAssetUrl(desktopSrc);
  const usesProxiedMobileImage = isProxiedStorefrontAssetUrl(mobileSrc);

  return (
    <section className="relative w-full bg-neutral-50">
      {/* Simple Split Layout */}
      <div className="container-premium">
        <div className="grid lg:grid-cols-2 min-h-[70vh] items-center gap-8 lg:gap-16 py-16 lg:py-24">
          {/* Content */}
          <div className="order-2 lg:order-1">
            <p className="text-sm uppercase tracking-[0.2em] text-neutral-500 mb-4">
              Deri Kordon
            </p>
            <h1 className="text-4xl lg:text-5xl xl:text-6xl font-serif font-medium text-neutral-900 leading-tight mb-6">
              {currentBanner.title || "El Yapımı Deri"}
            </h1>
            <p className="text-lg text-neutral-600 mb-8 max-w-md">
              {currentBanner.subtitle || "Hakiki deri, zamana meydan okuyan şıklık"}
            </p>
            <Link
              href={currentBanner.buttonLink || "/urunler"}
              className="inline-flex items-center gap-2 bg-neutral-900 text-white px-8 py-4 text-sm uppercase tracking-wider hover:bg-neutral-800 transition-colors"
            >
              {currentBanner.buttonText || "Koleksiyon"}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          {/* Image */}
          <div className="order-1 lg:order-2 relative aspect-[4/3] lg:aspect-auto lg:h-[60vh]">
            <div className="relative h-full w-full md:hidden">
              <Image
                src={mobileSrc}
                alt={currentBanner.alt}
                fill
                priority
                className="object-cover"
                sizes="100vw"
                quality={85}
                unoptimized={usesProxiedMobileImage}
              />
            </div>
            <div className="relative hidden h-full w-full md:block">
              <Image
                src={desktopSrc}
                alt={currentBanner.alt}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                quality={85}
                unoptimized={usesProxiedDesktopImage}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
