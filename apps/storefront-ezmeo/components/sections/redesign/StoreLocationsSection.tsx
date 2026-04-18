"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { useStoreInfo } from "@/lib/store-info-context";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import {
  isProxiedStorefrontAssetUrl,
  resolveStorefrontAssetUrl,
} from "@/lib/asset-url";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

interface StoreLocationsSectionProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  linkLabel?: string;
  storesHref: string;
  heroBanners?: Array<{ desktop?: string; mobile?: string; alt?: string }>;
  promoBanners?: Array<{ image?: string; mobileImage?: string; title?: string }>;
}

function buildGalleryImages({
  heroBanners,
  promoBanners,
}: Pick<StoreLocationsSectionProps, "heroBanners" | "promoBanners">) {
  const realImages = [
    ...(heroBanners || []).flatMap((banner) => [banner.desktop, banner.mobile]),
    ...(promoBanners || []).flatMap((banner) => [banner.image, banner.mobileImage]),
  ]
    .filter((image): image is string => Boolean(image))
    .map((image) => resolveStorefrontAssetUrl(image))
    .filter(Boolean)
    .slice(0, 3);

  if (realImages.length > 0) {
    return realImages;
  }

  return [
    "/fistik_ezmesi_kategori_gorsel.webp",
    "/Findik_Ezmeleri_Kategorisi.webp",
    "/hero-banner-fistik-ezmeleri.jpg",
  ];
}

export function StoreLocationsSection({
  eyebrow = "Ezmeo standardi",
  heading = "Daha temiz zemin, daha net urun hiyerarsisi.",
  description = "Bu vitrin, yogun kampanya alanlari yerine kavanozun kendisini ve kullanim anini one cikarir.",
  linkLabel = "Markayi tani",
  storesHref,
  heroBanners = [],
  promoBanners = [],
}: StoreLocationsSectionProps) {
  const { locale } = useStorefrontRoute();
  const { storeInfo } = useStoreInfo();
  const storeName = storeInfo?.name || STOREFRONT_RUNTIME.name;
  const address =
    storeInfo?.address || "Adres bilginiz eklendiginde burada destek ve iletisim notu olarak gorunur.";
  const phone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const email = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const galleryImages = buildGalleryImages({ heroBanners, promoBanners });

  const brandCards = [
    {
      title: "Urun once gelir",
      text: "Hero, listeleme ve PDP katmanlari kampanya kalabaligi yerine urun secimini hizlandirir.",
    },
    {
      title: "Guvenli pantry dili",
      text: "Daha net fiyat, daha az badge ve daha sakin copy tonu premium algiyi asagya cekmez.",
    },
    {
      title: "Mobilde hizli karar",
      text: "Daha buyuk gorsel alanlar, kisalan intro bloklari ve net CTA yeri ile karar daha hizli verilir.",
    },
  ];

  return (
    <section className="pt-14 lg:pt-18">
      <div className="container-premium">
        <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="surface-card px-5 py-6 md:px-7 md:py-8 lg:px-8">
            <p className="editorial-kicker">{eyebrow}</p>
            <h2 className="mt-5 max-w-3xl text-[var(--foreground)]">{heading}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-8 text-[var(--muted-foreground)] md:text-base">
              {description}
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {brandCards.map((card) => (
                <article
                  key={card.title}
                  className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--muted)] p-5"
                >
                  <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                    {card.title}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
                    {card.text}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={storesHref} className="btn-primary">
                {linkLabel}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link href={buildLocalizedPath("/iletisim", locale)} className="btn-secondary">
                Destek al
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <div className="relative min-h-[18rem] overflow-hidden rounded-[1.85rem] border border-[var(--border)] bg-[var(--background-strong)] shadow-[var(--shadow-md)] md:min-h-[21rem]">
                <Image
                  src={galleryImages[0]}
                  alt={`${storeName} vitrin gorseli`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 32vw"
                  unoptimized={isProxiedStorefrontAssetUrl(galleryImages[0])}
                />
              </div>

              <div className="grid gap-4">
                {galleryImages[1] ? (
                  <div className="relative min-h-[8.5rem] overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--background-strong)]">
                    <Image
                      src={galleryImages[1]}
                      alt={`${storeName} detay gorseli`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 20vw"
                      unoptimized={isProxiedStorefrontAssetUrl(galleryImages[1])}
                    />
                  </div>
                ) : null}

                <div className="rounded-[1.5rem] bg-[rgba(32,22,17,0.96)] p-5 text-white shadow-[var(--shadow-md)]">
                  <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">
                    <ShieldCheck className="h-4 w-4" />
                    Ezmeo sozu
                  </p>
                  <p className="mt-4 text-lg leading-snug">
                    Daha premium gorunmek icin bagirmaya degil, daha iyi oranlara ve daha temiz yuzeylere ihtiyac var.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                Iletisim
              </p>
              <div className="mt-4 grid gap-4 text-sm text-[var(--foreground)] md:grid-cols-3">
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 text-[var(--primary)]" />
                  <span>{phone}</span>
                </div>
                <div className="flex items-start gap-3 break-all">
                  <Mail className="mt-0.5 h-4 w-4 text-[var(--primary)]" />
                  <span>{email}</span>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-[var(--primary)]" />
                  <span className="text-[var(--muted-foreground)]">{address}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
