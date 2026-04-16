"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

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

function normalizeBanners(payload: unknown): PromoBanner[] {
  const rawBanners = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { banners?: unknown[] } | null)?.banners)
      ? (payload as { banners: unknown[] }).banners
      : [];

  return rawBanners.reduce<PromoBanner[]>((result, rawBanner, index) => {
      if (!rawBanner || typeof rawBanner !== "object") {
        return result;
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
        return result;
      }

      result.push({
        id: banner.id || index + 1,
        image,
        mobileImage: banner.mobileImage || banner.mobile || image,
        title: banner.title || `Kampanya ${index + 1}`,
        subtitle: banner.subtitle || "",
        buttonText: banner.buttonText || "İncele",
        buttonLink: banner.buttonLink || "/urunler",
        order: typeof banner.order === "number" ? banner.order : index + 1,
        badge: banner.badge,
        color: banner.color,
        discount: banner.discount,
        endDate: banner.endDate,
      });

      return result;
    }, []);
}

export default function PromotionalBanners({
  initialBanners = [],
}: PromotionalBannersProps) {
  const { locale } = useStorefrontRoute();
  const banners = normalizeBanners(initialBanners)
    .sort((left, right) => left.order - right.order)
    .slice(0, 3);

  if (banners.length === 0) {
    return null;
  }

  return (
    <section className="section-shell pt-0">
      <div className="container-premium">
        <div className="grid gap-4 lg:grid-cols-3">
          {banners.map((banner, index) => {
            const imageSrc = resolveStorefrontAssetUrl(banner.image) || banner.image;
            const href = buildLocalizedPath(banner.buttonLink || "/urunler", locale);
            const accent = banner.color || (index === 0 ? "#DA630D" : index === 1 ? "#505E71" : "#8390A1");

            return (
              <Link
                key={banner.id}
                href={href}
                className={`group relative overflow-hidden rounded-[28px] border border-[var(--store-border)] bg-white shadow-[var(--store-shadow-soft)] ${index === 0 ? "lg:col-span-2" : ""}`}
              >
                <div className={`relative ${index === 0 ? "aspect-[16/10]" : "aspect-[12/12.5]"}`}>
                  <Image
                    src={imageSrc}
                    alt={banner.title}
                    fill
                    className="object-cover transition duration-700 group-hover:scale-[1.03]"
                    sizes={index === 0 ? "(max-width: 1024px) 100vw, 60vw" : "(max-width: 1024px) 100vw, 30vw"}
                    unoptimized={imageSrc.startsWith("http")}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(80,94,113,0.08)_0%,rgba(80,94,113,0.68)_100%)]" />
                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white"
                        style={{ backgroundColor: accent }}
                      >
                        {banner.badge || "Seçili Kampanya"}
                      </span>
                      {banner.discount ? (
                        <span className="rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                          %{banner.discount}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-4 font-[var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-white">
                      {banner.title}
                    </h3>
                    {banner.subtitle ? (
                      <p className="mt-2 max-w-xl text-sm leading-7 text-white/80">
                        {banner.subtitle}
                      </p>
                    ) : null}
                    <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[var(--store-accent)]">
                      {banner.buttonText || "İncele"}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
