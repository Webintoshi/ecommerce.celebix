"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Percent, Sparkles } from "lucide-react";

export interface PromoBanner {
  id: number | string;
  image: string;
  mobileImage?: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  order: number;
  badge?: string;
  color?: string;
  discount?: string;
  endDate?: string;
}

interface PromotionalBannersProps {
  initialBanners?: PromoBanner[];
}

function getDefaultBadge(order: number): string {
  const badges = ["Yeni Tema", "Editor Secimi", "Hazir Kampanya"];
  return badges[order - 1] || "Placeholder";
}

function getDefaultColor(order: number): string {
  const colors = ["#7B1113", "#B85E2D", "#2E5A4F"];
  return colors[order - 1] || "#7B1113";
}

function getDefaultDiscount(order: number): string {
  const discounts = ["20", "15", "10"];
  return discounts[order - 1] || "10";
}

function getDefaultBanners(): PromoBanner[] {
  return [
    {
      id: 1,
      image: "/placeholders/promo-banner-1.svg",
      mobileImage: "/placeholders/promo-banner-1.svg",
      title: "Yeni koleksiyonunu konumlandir",
      subtitle: "Hazir hero alani",
      buttonText: "Urunleri gor",
      buttonLink: "/urunler",
      order: 1,
      badge: "Yeni Tema",
      color: "#7B1113",
      discount: "20",
    },
    {
      id: 2,
      image: "/placeholders/promo-banner-2.svg",
      mobileImage: "/placeholders/promo-banner-2.svg",
      title: "One cikan urun grubunu sergile",
      subtitle: "Editor secimi alani",
      buttonText: "Blog alanini ac",
      buttonLink: "/blog",
      order: 2,
      badge: "Editor Secimi",
      color: "#B85E2D",
      discount: "15",
    },
    {
      id: 3,
      image: "/placeholders/promo-banner-3.svg",
      mobileImage: "/placeholders/promo-banner-3.svg",
      title: "Hazir kampanya slotu",
      subtitle: "Polish icin acik alan",
      buttonText: "Iletisime gec",
      buttonLink: "/iletisim",
      order: 3,
      badge: "Hazir Kampanya",
      color: "#2E5A4F",
      discount: "10",
    },
  ];
}

function normalizeBanners(payload: unknown): PromoBanner[] {
  const rawBanners = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { banners?: unknown[] } | null)?.banners)
      ? (payload as { banners: unknown[] }).banners
      : [];

  return rawBanners
    .map((rawBanner, index) => {
      if (!rawBanner || typeof rawBanner !== "object") {
        return null;
      }

      const banner = rawBanner as Partial<PromoBanner> & {
        desktop?: string;
        mobile?: string;
        desktopImage?: string;
      };

      const image =
        banner.image ||
        banner.desktop ||
        banner.desktopImage ||
        banner.mobile ||
        banner.mobileImage ||
        "";

      if (!image) {
        return null;
      }

      return {
        id: banner.id || index + 1,
        image,
        mobileImage: banner.mobileImage || banner.mobile || image,
        title: banner.title || `Kampanya ${index + 1}`,
        subtitle: banner.subtitle || "",
        buttonText: banner.buttonText || "Incele",
        buttonLink: banner.buttonLink || "/urunler",
        order: typeof banner.order === "number" ? banner.order : index + 1,
        badge: banner.badge,
        color: banner.color,
        discount: banner.discount,
        endDate: banner.endDate,
      };
    })
    .filter((banner): banner is PromoBanner => Boolean(banner));
}

function withDefaults(banners: PromoBanner[]): PromoBanner[] {
  return banners.map((banner) => ({
    ...banner,
    badge: banner.badge || getDefaultBadge(banner.order),
    color: banner.color || getDefaultColor(banner.order),
    discount: banner.discount || getDefaultDiscount(banner.order),
  }));
}

export default function PromotionalBanners({
  initialBanners = [],
}: PromotionalBannersProps) {
  const normalizedInitialBanners = withDefaults(normalizeBanners(initialBanners));
  const [banners, setBanners] = useState<PromoBanner[]>(normalizedInitialBanners);
  const [loading, setLoading] = useState(normalizedInitialBanners.length === 0);

  useEffect(() => {
    async function fetchBanners() {
      if (normalizedInitialBanners.length > 0) {
        setBanners(normalizedInitialBanners);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/homepage", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Promosyon banner verileri yuklenemedi.");
        }

        const normalizedBanners = withDefaults(normalizeBanners(payload.promoBanners));
        setBanners(normalizedBanners.length > 0 ? normalizedBanners : getDefaultBanners());
      } catch {
        setBanners(getDefaultBanners());
      } finally {
        setLoading(false);
      }
    }

    void fetchBanners();
  }, [normalizedInitialBanners]);

  if (loading) {
    return (
      <section className="bg-[#ffffff] py-16 md:py-24" id="promotional-banners">
        <div className="mx-auto flex max-w-[1400px] gap-6 px-4 sm:px-6 lg:px-8">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="aspect-[16/10] flex-1 rounded-3xl bg-[#ffffff] animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  const sortedBanners = [...banners].sort((left, right) => left.order - right.order);
  const featured = sortedBanners[0];
  const secondary = sortedBanners.slice(1, 3);

  return (
    <section className="overflow-hidden bg-[#ffffff] py-16 md:py-24" id="promotional-banners">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center md:mb-14">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#7B1113] px-4 py-2 text-sm font-medium text-white shadow-lg">
            <Sparkles className="h-4 w-4" />
            Hazir kampanya alani
          </span>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-[#7B1113] md:text-5xl">
            Storefront base promo slotlari
          </h2>
          <p className="mx-auto max-w-2xl text-base text-[#6b4b4c] md:text-lg">
            Bu bloklar yeni magazada admin ayarlariyla doldurulur. Placeholder gorseller,
            tasarim ve polish surecini hizlandirmak icin birakildi.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {featured ? (
            <Link href={featured.buttonLink} className="group lg:col-span-7">
              <article className="relative aspect-[16/10] overflow-hidden rounded-3xl shadow-xl transition-all duration-500 group-hover:shadow-2xl lg:aspect-[16/9]">
                <Image
                  src={featured.image}
                  alt={featured.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 1024px) 100vw, 62vw"
                  priority
                  unoptimized={featured.image.startsWith("http")}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
                <div className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full bg-[#7B1113] px-4 py-2 text-sm font-bold text-white shadow-lg">
                  <Percent className="h-4 w-4" />
                  %{featured.discount || "20"} alan
                </div>
                <div className="absolute inset-0 flex flex-col justify-end p-8">
                  <span className="mb-2 text-sm font-medium uppercase tracking-wider text-white/80">
                    {featured.subtitle}
                  </span>
                  <h3 className="mb-4 text-3xl font-bold text-white md:text-4xl">
                    {featured.title}
                  </h3>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-[#7B1113] transition-colors group-hover:bg-[#F3E0E1]">
                    {featured.buttonText}
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </article>
            </Link>
          ) : null}

          <div className="flex flex-col gap-6 lg:col-span-5">
            {secondary.map((banner) => (
              <Link key={banner.id} href={banner.buttonLink} className="group flex-1">
                <article className="relative min-h-[240px] overflow-hidden rounded-3xl shadow-lg transition-all duration-500 group-hover:shadow-xl">
                  <Image
                    src={banner.image}
                    alt={banner.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 1024px) 100vw, 38vw"
                    unoptimized={banner.image.startsWith("http")}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute right-4 top-4 rounded-full border border-white/30 bg-white/20 px-3 py-1 text-sm font-bold text-white backdrop-blur-sm">
                    %{banner.discount || "10"}
                  </div>
                  <div className="absolute inset-0 flex flex-col justify-end p-6">
                    <h3 className="mb-2 text-2xl font-bold text-white">{banner.title}</h3>
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-white/90 transition-colors group-hover:text-white">
                      {banner.buttonText}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
