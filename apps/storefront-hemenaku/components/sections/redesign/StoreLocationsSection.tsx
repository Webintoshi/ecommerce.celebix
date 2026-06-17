"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { useStoreInfo } from "@/lib/store-info-context";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

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
          src: image,
          alt: banner.alt || `${storeName} vitrin gorunumu`,
          city: "Vitrin",
        })),
    ),
    ...(promoBanners || []).flatMap((banner, index) =>
      [banner.image, banner.mobileImage]
        .filter((image): image is string => Boolean(image))
        .map((image, imageIndex) => ({
          id: `promo-${index}-${imageIndex}`,
          src: image,
          alt: banner.title || `${storeName} koleksiyon gorseli`,
          city: "Koleksiyon",
        })),
    ),
  ].slice(0, 4);

  if (realImages.length > 0) {
    return realImages;
  }

  return [
    { id: "placeholder-1", src: "/placeholders/promo-banner-1.svg", alt: `${storeName} vitrin gorunumu`, city: "Vitrin" },
    { id: "placeholder-2", src: "/placeholders/promo-banner-2.svg", alt: `${storeName} secili urun gorunumu`, city: "Secim" },
    { id: "placeholder-3", src: "/placeholders/promo-banner-3.svg", alt: `${storeName} teslimat gorunumu`, city: "Teslimat" },
    { id: "placeholder-4", src: "/placeholder.svg", alt: `${storeName} destek gorunumu`, city: "Destek" },
  ];
}

export function StoreLocationsSection({
  eyebrow = "Magaza Deneyimi",
  heading = "Alisveris oncesinden teslimata kadar destek yaninizda",
  description = "Hemenaku, net iletisim kanallari ve sade teslimat bilgileriyle karar vermeyi kolaylastirir.",
  linkLabel = "Iletisim bilgilerini gor",
  storesHref,
  heroBanners = [],
  promoBanners = [],
}: StoreLocationsSectionProps) {
  const { storeInfo } = useStoreInfo();
  const storeName = storeInfo?.name || STOREFRONT_RUNTIME.name;
  const address = storeInfo?.address || "Online destek ve siparis danismanligi Hemenaku iletisim kanallarindan saglanir.";
  const phone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const email = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const galleryImages = buildGalleryImages({ heroBanners, promoBanners, storeName });
  const mapUrl = storeInfo?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeInfo.address)}`
    : storesHref;

  const cards = [
    {
      id: "main",
      badge: "Alisveris Destegi",
      name: `${storeName} destek akisi`,
      summary:
        storeInfo?.address
          ? `${storeName} iletisim ve adres bilgileri siparis oncesi sorular icin net sekilde sunulur.`
          : `${storeName} ekibi siparis, teslimat ve urun sorulari icin iletisim kanallarindan destek verir.`,
      hours: "Hafta ici hizli geri donus",
      address,
      actionHref: mapUrl,
      actionLabel: storeInfo?.address ? "Harita" : "Iletisim",
      icon: <MapPin className="size-4" />,
    },
    {
      id: "support",
      badge: "Iletisim",
      name: "Siparis ve teslimat hatti",
      summary:
        "Urun, teslimat ve iade sorulari icin telefon ve e-posta kanallari tek noktadan gorunur.",
      hours: "Hafta ici hizli geri donus",
      address: `${phone} • ${email}`,
      actionHref: `mailto:${email}`,
      actionLabel: "E-Posta",
      icon: <Mail className="size-4" />,
    },
  ];

  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-[1500px] px-5 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase text-[#0F766E]">
            {eyebrow}
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-[#111827] sm:text-4xl">
            {heading}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#526B66] sm:text-[15px]">
            {description}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 lg:grid-cols-4 lg:gap-4">
          {galleryImages.map((image, index) => (
            <div key={image.id} className="group relative overflow-hidden rounded-lg bg-[#E6F3F0]">
              <div className="relative aspect-[5/5.8]">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  priority={index < 2}
                  sizes="(min-width: 1280px) 24vw, (min-width: 768px) 25vw, 50vw"
                  className="object-cover transition duration-700 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/34 via-black/0 to-transparent" />
                <div className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase text-[#0F766E] backdrop-blur">
                  {image.city}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <article
              key={card.id}
              className="rounded-lg border border-[#DDE7E4] bg-[#F7FAF9] p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase text-[#0F766E]">
                    {card.badge}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#111827]">{card.name}</h3>
                </div>

                <a
                  href={card.actionHref}
                  className="inline-flex items-center gap-2 rounded-full border border-[#DDE7E4] bg-white px-3.5 py-2 text-sm font-semibold text-[#111827] transition hover:border-[#0F766E] hover:text-[#0F766E]"
                >
                  {card.icon}
                  <span>{card.actionLabel}</span>
                </a>
              </div>

              <p className="mt-4 max-w-xl text-sm leading-7 text-[#526B66]">{card.summary}</p>

              <div className="mt-5 space-y-3 text-sm text-[#334A45]">
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                  <Clock3 className="size-4 text-[#0F766E]" />
                  <span>{card.hours}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-1 size-4 text-[#0F766E]" />
                  <p className="text-sm leading-6 text-[#526B66]">{card.address}</p>
                </div>
                <div className="flex flex-wrap gap-5 text-[#526B66]">
                  <span className="inline-flex items-center gap-2">
                    <Phone className="size-4 text-[#0F766E]" />
                    {phone}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Mail className="size-4 text-[#0F766E]" />
                    {email}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href={storesHref}
            className="inline-flex items-center gap-2 rounded-full border border-[#DDE7E4] bg-white px-5 py-3 text-sm font-semibold text-[#111827] transition hover:border-[#0F766E] hover:text-[#0F766E]"
          >
            <span>{linkLabel}</span>
            <ExternalLink className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
