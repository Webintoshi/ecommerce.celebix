"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BatteryCharging, Car, Check, Headphones, Shield, Truck, Wrench, Zap } from "lucide-react";
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import type { HomepageCategory, HomepageHeroBanner } from "@/lib/homepage";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import type { Product } from "@/types/product";

type VisualProduct = Product & {
  category?: string | null;
  subcategory?: string | null;
  images_v2?: Array<string | { url?: string }>;
};

type ImageSource = {
  src: string;
  alt: string;
};

const promoTargets = [
  {
    title: "Binek Araç Aküleri",
    slug: "akuler",
    keywords: ["otomobil", "60ah", "72ah", "90ah", "aküler"],
    Icon: Car,
  },
  {
    title: "Start-Stop Aküler",
    slug: "start-stop-akuler",
    keywords: ["start-stop", "agm", "efb"],
    Icon: Zap,
  },
  {
    title: "Ağır Vasıta Aküleri",
    slug: "agir-vasita-akuleri",
    keywords: ["ağır", "agir", "180ah", "225ah"],
    Icon: Truck,
  },
];

function normalizeKey(value?: string | null) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getProductImages(product?: VisualProduct | null) {
  if (!product) {
    return [];
  }

  const legacyImagesV2 = Array.isArray(product.images_v2)
    ? product.images_v2
        .map((image) => (typeof image === "string" ? image : image?.url ?? ""))
        .filter(Boolean)
    : [];
  const structuredImages = Array.isArray(product.imagesV2)
    ? product.imagesV2.map((image) => image.url).filter(Boolean)
    : [];

  return (Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : structuredImages.length > 0
      ? structuredImages
      : legacyImagesV2)
    .map((image) => resolveStorefrontAssetUrl(image))
    .filter(Boolean);
}

function findCategory(categories: HomepageCategory[], slug: string) {
  const targetSlug = normalizeKey(slug);

  return categories.find((category) => normalizeKey(category.slug) === targetSlug);
}

function findProduct(products: VisualProduct[], keywords: string[]) {
  const normalizedKeywords = keywords.map((keyword) => normalizeKey(keyword));

  return products.find((product) => {
    const haystack = normalizeKey([
      product.name,
      product.slug,
      product.category,
      product.subcategory,
    ].filter(Boolean).join(" "));

    return normalizedKeywords.some((keyword) => haystack.includes(keyword));
  });
}

function resolvePromoImage(
  categories: HomepageCategory[],
  products: VisualProduct[],
  slug: string,
  keywords: string[],
): ImageSource | null {
  const category = findCategory(categories, slug);
  const categoryImage = resolveStorefrontAssetUrl(category?.image);

  if (categoryImage) {
    return {
      src: categoryImage,
      alt: category?.name || slug,
    };
  }

  const product = findProduct(products, keywords);
  const productImage = getProductImages(product)[0];

  return productImage
    ? {
        src: productImage,
        alt: product?.name || slug,
      }
    : null;
}

function VisualImage({
  image,
  label,
  className = "object-cover",
  priority = false,
}: {
  image?: ImageSource | null;
  label: string;
  className?: string;
  priority?: boolean;
}) {
  const [hasError, setHasError] = useState(false);

  if (!image?.src || hasError) {
    return (
      <DefaultDemoPlaceholder
        id="placeholder-01"
        label={label}
        compact
        className="absolute inset-0"
      />
    );
  }

  return (
    <Image
      src={image.src}
      alt={image.alt || label}
      fill
      className={className}
      sizes="(max-width: 640px) 92vw, (max-width: 1024px) 44vw, 30vw"
      priority={priority}
      unoptimized={isProxiedStorefrontAssetUrl(image.src)}
      onError={() => setHasError(true)}
    />
  );
}

export function VisualPromoRail({
  categories = [],
  products = [],
}: {
  categories?: HomepageCategory[];
  products?: VisualProduct[];
}) {
  const { buildPath } = useStorefrontRoute();

  const cards = useMemo(
    () =>
      promoTargets.map((target) => ({
        ...target,
        image: resolvePromoImage(categories, products, target.slug, target.keywords),
        href: buildPath(ROUTES.category(target.slug)),
      })),
    [buildPath, categories, products],
  );

  return (
    <section className="bg-[#0B1220] px-4 pb-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-[1500px] gap-3 md:grid-cols-3 lg:gap-5">
        {cards.map((card, index) => {
          const Icon = card.Icon;

          return (
            <Link
              key={card.slug}
              href={card.href}
              className="group relative min-h-[230px] overflow-hidden rounded-lg border border-white/10 bg-[#111827] shadow-[0_24px_80px_-56px_rgba(0,0,0,0.8)] transition hover:-translate-y-0.5 hover:border-[#FACC15]/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FACC15]"
            >
              <VisualImage image={card.image} label={card.title} priority={index === 0} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,17,31,0.02)_0%,rgba(8,17,31,0.82)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-white/16 bg-white/12 text-[#FACC15] backdrop-blur-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold leading-tight text-white sm:text-2xl">
                  {card.title}
                </h2>
                <span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#FACC15]">
                  Kategoriye Git
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function VisualServiceStrip() {
  const services = [
    { label: "Hızlı teslimat", Icon: Truck },
    { label: "Doğru ürün desteği", Icon: Wrench },
    { label: "Kolay sipariş", Icon: Check },
    { label: "Güvenilir alışveriş", Icon: Shield },
  ];

  return (
    <section className="bg-white py-5">
      <div className="container-premium">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {services.map(({ label, Icon }) => (
            <div
              key={label}
              className="flex min-h-20 items-center gap-3 rounded-lg border border-[#D8E1EA] bg-[#F8FAFC] px-4 py-3"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#0B1220] text-[#FACC15]">
                <Icon className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold leading-tight text-[#0B1220]">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VisualSupportSection({
  heroBanners = [],
  products = [],
}: {
  heroBanners?: HomepageHeroBanner[];
  products?: VisualProduct[];
}) {
  const { buildPath } = useStorefrontRoute();
  const heroImage = heroBanners[0]?.desktop || heroBanners[0]?.mobile;
  const productImage = getProductImages(products[0])[0];
  const visual = resolveStorefrontAssetUrl(heroImage) || productImage;
  const image = visual
    ? {
        src: visual,
        alt: heroBanners[0]?.alt || products[0]?.name || "Hemenaku destek görseli",
      }
    : null;

  return (
    <section className="bg-[#F3F6FA] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <div className="mx-auto grid max-w-[1500px] overflow-hidden rounded-lg border border-[#172033] bg-[#0B1220] text-white shadow-[0_34px_120px_-82px_rgba(11,18,32,0.9)] lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative min-h-[260px] lg:min-h-[420px]">
          <VisualImage image={image} label="Hemenaku destek" className="object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,18,32,0.08),rgba(11,18,32,0.62))]" />
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-12">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-[#FACC15] text-[#0B1220]">
            <Headphones className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
            Hangi akü uygun?
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-300">
            Destek alın, doğru ürünü seçin.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href={buildPath(ROUTES.contact)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#FACC15] px-5 py-3 text-sm font-semibold text-[#0B1220] transition hover:bg-[#FDE047]"
            >
              Destek Al
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={buildPath(ROUTES.products)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/18 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Ürünleri İncele
              <BatteryCharging className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
