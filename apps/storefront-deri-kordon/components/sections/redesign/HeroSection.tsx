import { resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface HeroBanner {
  id: string | number;
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

  return (
    <section className="relative w-full">
      <div className="relative w-full overflow-hidden">
        <picture>
          <source media="(max-width: 767px)" srcSet={mobileSrc} />
          <source media="(min-width: 768px)" srcSet={desktopSrc} />
          <img
            src={desktopSrc}
            alt={currentBanner.alt}
            fetchPriority="high"
            loading="eager"
            decoding="async"
            sizes="100vw"
            className="block w-full aspect-[4/5] object-cover object-center md:aspect-[16/7] lg:aspect-[16/6] xl:aspect-[16/5.75]"
          />
        </picture>
      </div>
    </section>
  );
}
