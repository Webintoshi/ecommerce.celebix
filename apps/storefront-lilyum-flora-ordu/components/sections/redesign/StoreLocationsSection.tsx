"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Star } from "lucide-react";
import { resolveStorefrontAssetUrl, isProxiedStorefrontAssetUrl } from "@/lib/asset-url";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import type { HomepageTestimonial } from "@/lib/homepage";
import { SectionHeader } from "./SectionHeader";
import { cn } from "@/lib/utils";

interface ProductLike {
  id?: string;
  slug?: string;
  name?: string;
  category?: string;
  images?: string[];
  images_v2?: Array<string | { url?: string }>;
}

interface ReviewShowcaseItem {
  id: string;
  reviewerName: string;
  rating: number;
  body: string;
  title?: string | null;
  productName: string;
  productCategory?: string;
  productHref?: string;
  productImage?: string;
}

interface StoreLocationsSectionProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  linkLabel?: string;
  storesHref: string;
  testimonials?: HomepageTestimonial[];
  products?: Array<Record<string, unknown>>;
}

function getResolvedProductImages(product: ProductLike) {
  const legacyImagesV2 = Array.isArray(product.images_v2)
    ? (product.images_v2 ?? [])
        .map((image) => (typeof image === "string" ? image : image?.url ?? ""))
        .filter((image) => image.length > 0)
    : [];

  return (Array.isArray(product.images) && product.images.length > 0 ? product.images : legacyImagesV2)
    .map((image) => resolveStorefrontAssetUrl(image))
    .filter((image) => image.length > 0);
}

function normalizeShowcaseItems(
  testimonials: HomepageTestimonial[] = [],
  products: Array<Record<string, unknown>> = [],
  locale: Parameters<typeof buildLocalizedPath>[1],
): ReviewShowcaseItem[] {
  const productPool = products
    .map((product) => product as ProductLike)
    .filter((product) => product.slug && product.name)
    .map((product) => {
      const images = getResolvedProductImages(product);
      return {
        ...product,
        primaryImage: images[0],
      };
    })
    .filter((product) => product.primaryImage)
    .slice(0, 8);

  if (productPool.length === 0) {
    return [];
  }

  return testimonials
    .filter((item) => item.body && item.name)
    .slice(0, 3)
    .map((item, index) => {
      const linkedProduct = productPool[index % productPool.length];

      return {
        id: item.id,
        reviewerName: item.name,
        rating: Math.max(1, Math.min(5, item.rating || 5)),
        body: item.body,
        title: item.title || null,
        productName: linkedProduct.name || "Se\u00e7ilen \u00fcr\u00fcn",
        productCategory: linkedProduct.category,
        productHref: linkedProduct.slug ? buildLocalizedPath(`/urunler/${linkedProduct.slug}`, locale) : undefined,
        productImage: linkedProduct.primaryImage,
      };
    });
}

function ReviewCard({
  item,
  featured = false,
}: {
  item: ReviewShowcaseItem;
  featured?: boolean;
}) {
  const bodyClassName = featured ? "line-clamp-5" : "line-clamp-4";
  const imageSizes = featured ? "(max-width: 1024px) 100vw, 42vw" : "(max-width: 1024px) 100vw, 24vw";
  const usesProxiedImage = item.productImage ? isProxiedStorefrontAssetUrl(item.productImage) : false;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[30px] border border-[var(--store-border)] bg-white shadow-[var(--store-shadow-soft)]",
        featured ? "lg:grid lg:grid-cols-[0.9fr_1.1fr]" : "h-full",
      )}
    >
      <div className={cn("relative overflow-hidden bg-[var(--store-surface-alt)]", featured ? "aspect-[4/5] lg:aspect-auto" : "aspect-[16/11]")}>
        {item.productHref ? (
          <Link href={item.productHref} className="absolute inset-0">
            {item.productImage ? (
              <Image
                src={item.productImage}
                alt={item.productName}
                fill
                className="object-cover"
                sizes={imageSizes}
                unoptimized={usesProxiedImage}
              />
            ) : null}
          </Link>
        ) : item.productImage ? (
          <Image
            src={item.productImage}
            alt={item.productName}
            fill
            className="object-cover"
            sizes={imageSizes}
            unoptimized={usesProxiedImage}
          />
        ) : null}
      </div>

      <div className="flex h-full flex-col justify-between p-5 sm:p-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(218,99,13,0.1)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--store-accent)]">
              {"Sat\u0131n alan notu"}
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--store-accent)]">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star
                  key={`${item.id}-${index}`}
                  className={cn(
                    "h-4 w-4",
                    index < item.rating
                      ? "fill-[var(--store-accent)] text-[var(--store-accent)]"
                      : "fill-[var(--store-surface-alt)] text-[var(--store-surface-alt)]",
                  )}
                />
              ))}
            </span>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
              {item.productCategory || "\u00c7i\u00e7ek se\u00e7imi"}
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--store-ink)]">
              {item.productName}
            </h3>
            {item.title ? (
              <p className="mt-4 text-sm font-semibold text-[var(--store-ink)]">{item.title}</p>
            ) : null}
            <p className={cn("mt-3 text-sm leading-7 text-[var(--store-ink-soft)]", bodyClassName)}>{item.body}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--store-border)] pt-4">
          <div>
            <p className="text-sm font-semibold text-[var(--store-ink)]">{item.reviewerName}</p>
            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--store-muted)]">
              <Check className="h-3 w-3" />
              {"Do\u011frulanm\u0131\u015f yorum"}
            </span>
          </div>

          {item.productHref ? (
            <Link href={item.productHref} className="rounded-full border border-[var(--store-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]">
              {"\u00dcr\u00fcn\u00fc incele"}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function StoreLocationsSection({
  eyebrow = "Yorumlar",
  heading = "Se\u00e7ilen \u00e7i\u00e7ekler i\u00e7in m\u00fc\u015fteri notlar\u0131",
  description = "Ger\u00e7ek yorumlar\u0131 \u00fcr\u00fcn g\u00f6rselleriyle birlikte, daha ticari ve daha g\u00fcven veren bir vitrinde sunuyoruz.",
  linkLabel = "T\u00fcm \u00fcr\u00fcnleri g\u00f6r",
  storesHref,
  testimonials = [],
  products = [],
}: StoreLocationsSectionProps) {
  const { locale } = useStorefrontRoute();
  const showcaseItems = normalizeShowcaseItems(testimonials, products, locale);

  if (showcaseItems.length === 0) {
    return null;
  }

  const [featuredItem, ...secondaryItems] = showcaseItems;

  return (
    <section className="section-shell">
      <div className="container-premium">
        <SectionHeader
          eyebrow={eyebrow}
          title={heading}
          description={description}
          action={
            <Link href={storesHref} className="cta-secondary">
              {linkLabel}
            </Link>
          }
        />

        <div className={cn("mt-8 grid gap-5", secondaryItems.length > 0 && "lg:grid-cols-[1.08fr_0.92fr]")}>
          <ReviewCard item={featuredItem} featured />

          {secondaryItems.length > 0 ? (
            <div className="grid gap-5">
              {secondaryItems.map((item) => (
                <ReviewCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
