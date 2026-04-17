"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Star } from "lucide-react";
import { resolveStorefrontAssetUrl, isProxiedStorefrontAssetUrl } from "@/lib/asset-url";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import type { HomepageTestimonial } from "@/lib/homepage";
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
}: {
  item: ReviewShowcaseItem;
}) {
  const bodyClassName = "line-clamp-4";
  const imageSizes = "(max-width: 1024px) 100vw, 20vw";
  const usesProxiedImage = item.productImage ? isProxiedStorefrontAssetUrl(item.productImage) : false;

  return (
    <article className="flex h-full flex-col rounded-[32px] border border-[rgba(80,94,113,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,246,246,0.94)_100%)] p-5 shadow-[0_28px_70px_-52px_rgba(80,94,113,0.40)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(218,99,13,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--store-accent)]">
          {"M\u00fc\u015fteri yorumu"}
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--store-accent)]">
          {Array.from({ length: 5 }).map((_, index) => (
            <Star
              key={`${item.id}-${index}`}
              className={cn(
                "h-3.5 w-3.5",
                index < item.rating
                  ? "fill-[var(--store-accent)] text-[var(--store-accent)]"
                  : "fill-[rgba(80,94,113,0.10)] text-[rgba(80,94,113,0.10)]",
              )}
            />
          ))}
        </span>
      </div>

      <div className="mt-6 flex min-h-[200px] flex-1 flex-col">
        <span className="text-5xl leading-none text-[rgba(218,99,13,0.18)]">“</span>
        {item.title ? (
          <p className="mt-4 line-clamp-2 text-[15px] font-semibold tracking-[-0.02em] text-[var(--store-ink)]">
            {item.title}
          </p>
        ) : null}
        <p className={cn("mt-3 text-[15px] leading-8 text-[var(--store-ink-soft)]", bodyClassName)}>
          {item.body}
        </p>
      </div>

      <div className="mt-7 rounded-[26px] bg-white/92 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_12px_28px_-24px_rgba(80,94,113,0.26)]">
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[20px] bg-[var(--store-surface-alt)]">
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

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
                {"Alan ki\u015fi"}
              </p>
              <span className="rounded-full bg-[var(--store-surface-alt)] px-2.5 py-1 text-[11px] font-medium text-[var(--store-ink-soft)]">
                {item.reviewerName}
              </span>
            </div>
            <p className="mt-3 line-clamp-2 text-lg font-semibold tracking-[-0.03em] text-[var(--store-ink)]">
              {item.productName}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--store-muted)]">
              <Check className="h-3.5 w-3.5 text-[var(--store-accent)]" />
              <span>{"Do\u011frulanm\u0131\u015f yorum"}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgba(80,94,113,0.08)] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
            {item.productCategory || "Ald\u0131\u011f\u0131 \u00fcr\u00fcn"}
          </p>
          {item.productHref ? (
            <Link
              href={item.productHref}
              className="rounded-full border border-[rgba(80,94,113,0.10)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--store-ink-soft)] transition hover:border-[rgba(218,99,13,0.24)] hover:text-[var(--store-accent)]"
            >
              {"\u00dcr\u00fcn\u00fc incele"}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function StoreLocationsSection({
  eyebrow = "M\u00fc\u015fteri Yorumlar\u0131",
  heading = "Teslim edilen secimlerden notlar",
  description = "",
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

  return (
    <section className="section-shell">
      <div className="container-premium">
        <div className="overflow-hidden rounded-[40px] border border-[rgba(80,94,113,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(238,242,245,0.62)_100%)] px-5 py-6 shadow-[0_36px_90px_-58px_rgba(80,94,113,0.34)] sm:px-7 sm:py-7 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="section-eyebrow">{eyebrow}</p>
              <h2 className="mt-4 text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.05em] text-[var(--store-ink)]">
                {heading}
              </h2>
              {description ? (
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--store-ink-soft)] sm:text-[15px]">
                  {description}
                </p>
              ) : null}
            </div>

            <Link href={storesHref} className="cta-secondary self-start lg:self-auto">
              {linkLabel}
            </Link>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {showcaseItems.map((item) => (
              <ReviewCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
