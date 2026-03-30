"use client";

import Image from "next/image";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface HeroBanner {
  id: number;
  desktop: string;
  mobile?: string;
  alt: string;
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
    alt: "Premium Deri Urunleri",
  },
];

export function HeroSection({ slides, banners }: HeroSectionProps) {
  const heroBanners =
    (slides && slides.length > 0 ? slides : null) ||
    (banners && banners.length > 0 ? banners : null) ||
    defaultBanners;

  const currentBanner = heroBanners[0];
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
      <div className="relative w-full overflow-hidden">
        <div className="relative aspect-[4/5] w-full md:hidden">
          <Image
            src={mobileSrc}
            alt={currentBanner.alt}
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
            quality={85}
            unoptimized={usesProxiedMobileImage}
          />
        </div>
        <div className="relative hidden w-full md:block md:aspect-[16/7] lg:aspect-[16/6] xl:aspect-[16/5.75]">
          <Image
            src={desktopSrc}
            alt={currentBanner.alt}
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
            quality={85}
            unoptimized={usesProxiedDesktopImage}
          />
        </div>
      </div>
    </section>
  );
}
