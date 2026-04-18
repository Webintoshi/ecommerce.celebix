"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { useStoreInfo } from "@/lib/store-info-context";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
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
  heading = "Dogal his, rafine sunum, net urun odagi.",
  description = "Bu vitrin, yuksek sesli kampanya alanlari yerine urunun rengi, kivami ve etiket karakteri etrafinda sakin bir premium duygu kurar.",
  linkLabel = "Markayi tani",
  storesHref,
  heroBanners = [],
  promoBanners = [],
}: StoreLocationsSectionProps) {
  const { locale } = useStorefrontRoute();
  const { storeInfo } = useStoreInfo();
  const storeName = storeInfo?.name || STOREFRONT_RUNTIME.name;
  const address =
    storeInfo?.address || "Adres bilginiz eklendiginde burada iletisim notu olarak gorunur.";
  const phone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const email = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const galleryImages = buildGalleryImages({ heroBanners, promoBanners });

  const brandCards = [
    {
      title: "Urun once gelir",
      text: "Kartlar, koleksiyon bloklari ve PDP hiyerarsisi urunu one cikarir; gereksiz gorsel kalabalik geri cekilir.",
    },
    {
      title: "Lezzet kadar güven",
      text: "Icerik odakli metinler, sakin tonlar ve net fiyat hiyerarsisi daha premium bir ilk izlenim kurar.",
    },
    {
      title: "Mobilde de rafine",
      text: "Dokunmatik akista hizli tarama, buyuk gorsel kadrajlar ve net CTA ritmi korunur.",
    },
  ];

  return (
    <section className="pt-14 lg:pt-18">
      <div className="container-premium">
        <div className="surface-card overflow-hidden px-5 py-6 md:px-7 md:py-8 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <p className="editorial-kicker">{eyebrow}</p>
              <h2 className="mt-5 max-w-3xl text-[var(--foreground)]">{heading}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-8 text-[var(--muted-foreground)] md:text-base">
                {description}
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {brandCards.map((card) => (
                  <article
                    key={card.title}
                    className="rounded-[1.75rem] border border-[var(--border)] bg-[rgba(255,250,244,0.76)] p-5"
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
              <div className="grid grid-cols-[1.2fr_0.8fr] gap-4">
                {galleryImages.slice(0, 2).map((image, index) => (
                  <div
                    key={image}
                    className={`relative overflow-hidden rounded-[1.75rem] bg-[var(--background-strong)] ${
                      index === 0 ? "min-h-[22rem]" : "min-h-[22rem]"
                    }`}
                  >
                    <Image
                      src={image}
                      alt={`${storeName} vitrin gorseli ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 26vw"
                      unoptimized={isProxiedStorefrontAssetUrl(image)}
                    />
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[1.75rem] bg-[rgba(38,23,16,0.94)] p-6 text-white">
                  <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/58">
                    <ShieldCheck className="h-4 w-4" />
                    Ezmeo sozu
                  </p>
                  <p className="mt-4 text-xl leading-snug">
                    Daha premium görünmek icin bagirmaya degil, daha iyi oranlara ve daha iyi bosluga ihtiyac var.
                  </p>
                </div>

                <div className="rounded-[1.75rem] border border-[var(--border)] bg-[rgba(255,250,244,0.76)] p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                    Iletisim
                  </p>
                  <div className="mt-4 space-y-4 text-sm text-[var(--foreground)]">
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

              {galleryImages[2] ? (
                <div className="relative min-h-[13rem] overflow-hidden rounded-[1.75rem] bg-[var(--background-strong)]">
                  <Image
                    src={galleryImages[2]}
                    alt={`${storeName} detay gorseli`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 36vw"
                    unoptimized={isProxiedStorefrontAssetUrl(galleryImages[2])}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
