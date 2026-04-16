"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3, ExternalLink, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { useStoreInfo } from "@/lib/store-info-context";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { SectionHeader } from "./SectionHeader";

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
  storeName,
}: Pick<StoreLocationsSectionProps, "heroBanners" | "promoBanners"> & { storeName: string }) {
  const realImages = [
    ...(heroBanners || []).flatMap((banner, index) =>
      [banner.desktop, banner.mobile]
        .filter((image): image is string => Boolean(image))
        .map((image, imageIndex) => ({
          id: `hero-${index}-${imageIndex}`,
          src: resolveStorefrontAssetUrl(image) || image,
          alt: banner.alt || `${storeName} vitrin görünümü`,
        })),
    ),
    ...(promoBanners || []).flatMap((banner, index) =>
      [banner.image, banner.mobileImage]
        .filter((image): image is string => Boolean(image))
        .map((image, imageIndex) => ({
          id: `promo-${index}-${imageIndex}`,
          src: resolveStorefrontAssetUrl(image) || image,
          alt: banner.title || `${storeName} kampanya görseli`,
        })),
    ),
  ].slice(0, 3);

  return realImages;
}

export function StoreLocationsSection({
  eyebrow = "Mağaza",
  heading = "Teslimat ve iletişim",
  description,
  linkLabel = "İletişime Git",
  storesHref,
  heroBanners = [],
  promoBanners = [],
}: StoreLocationsSectionProps) {
  const { storeInfo } = useStoreInfo();
  const storeName = storeInfo?.name || STOREFRONT_RUNTIME.name;
  const address = storeInfo?.address || "Adres bilgisi eklendiğinde burada görünür.";
  const phone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const email = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const galleryImages = buildGalleryImages({ heroBanners, promoBanners, storeName });
  const mapUrl = storeInfo?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeInfo.address)}`
    : storesHref;

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

        <div className="mt-8 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="soft-panel overflow-hidden p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {galleryImages.length > 0 ? (
                galleryImages.map((image, index) => (
                  <div key={image.id} className={`relative overflow-hidden rounded-[24px] ${index === 0 ? "sm:col-span-2" : ""}`}>
                    <div className={`relative ${index === 0 ? "aspect-[16/12]" : "aspect-[4/5]"}`}>
                      <Image
                        src={image.src}
                        alt={image.alt}
                        fill
                        priority={index === 0}
                        sizes={index === 0 ? "(max-width: 640px) 100vw, 40vw" : "(max-width: 640px) 100vw, 20vw"}
                        className="object-cover"
                        unoptimized={image.src.startsWith("http")}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[28px] bg-[linear-gradient(135deg,#f7ebe8_0%,#f1dfdb_100%)] p-8 sm:col-span-3">
                  <p className="section-eyebrow">Hazır Alan</p>
                  <h3 className="mt-3 font-[var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-[var(--store-ink)]">
                    Mağaza görselleri geldikçe burası dolar
                  </h3>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <article className="soft-panel p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="section-eyebrow">İletişim</p>
                  <h3 className="mt-3 font-[var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-[var(--store-ink)]">
                    {storeName}
                  </h3>
                </div>
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--store-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                >
                  Harita
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-6 grid gap-4 text-sm text-[var(--store-ink-soft)]">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-1 h-4 w-4 text-[var(--store-accent)]" />
                  <p className="leading-7">{address}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-[var(--store-accent)]" />
                  <a href={`tel:${phone}`} className="hover:text-[var(--store-accent)]">
                    {phone}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-[var(--store-accent)]" />
                  <a href={`mailto:${email}`} className="hover:text-[var(--store-accent)]">
                    {email}
                  </a>
                </div>
              </div>
            </article>

            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-[28px] border border-[var(--store-border)] bg-white p-5 shadow-[var(--store-shadow-soft)]">
                <Clock3 className="h-5 w-5 text-[var(--store-accent)]" />
                <h4 className="mt-4 text-lg font-semibold text-[var(--store-ink)]">
                  Hızlı Geri Dönüş
                </h4>
                <p className="mt-2 text-sm leading-7 text-[var(--store-ink-soft)]">
                  Sipariş ve teslimat soruları için ulaşım bilgileri net tutulur.
                </p>
              </article>

              <article className="rounded-[28px] border border-[var(--store-border)] bg-white p-5 shadow-[var(--store-shadow-soft)]">
                <ShieldCheck className="h-5 w-5 text-[var(--store-accent)]" />
                <h4 className="mt-4 text-lg font-semibold text-[var(--store-ink)]">
                  Güven Veren Sunum
                </h4>
                <p className="mt-2 text-sm leading-7 text-[var(--store-ink-soft)]">
                  Adres, telefon ve destek bilgileri tek ritimde sunulur.
                </p>
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
