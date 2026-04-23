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
    { id: "placeholder-1", src: "/placeholders/promo-banner-1.svg", alt: `${storeName} taslak gorunum 1`, city: "Studio" },
    { id: "placeholder-2", src: "/placeholders/promo-banner-2.svg", alt: `${storeName} taslak gorunum 2`, city: "Showroom" },
    { id: "placeholder-3", src: "/placeholders/promo-banner-3.svg", alt: `${storeName} taslak gorunum 3`, city: "Atolye" },
    { id: "placeholder-4", src: "/placeholder.svg", alt: `${storeName} taslak gorunum 4`, city: "Marka" },
  ];
}

export function StoreLocationsSection({
  eyebrow = "Magaza Deneyimi",
  heading = "Markanizi fiziksel temas noktalariyla guclendirin",
  description = "Genel ayarlara girdiginiz iletisim ve adres verileri, bu alanda otomatik olarak premium bir sunuma donusur.",
  linkLabel = "Magaza detaylarini gor",
  storesHref,
  heroBanners = [],
  promoBanners = [],
}: StoreLocationsSectionProps) {
  const { storeInfo } = useStoreInfo();
  const storeName = storeInfo?.name || STOREFRONT_RUNTIME.name;
  const address = storeInfo?.address || "Adres bilgisi admin genel ayarlarda tanimlandiginda burada otomatik gorunur.";
  const phone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const email = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const galleryImages = buildGalleryImages({ heroBanners, promoBanners, storeName });
  const mapUrl = storeInfo?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeInfo.address)}`
    : storesHref;

  const cards = [
    {
      id: "main",
      badge: "Magaza & Deneyim",
      name: `${storeName} Studio`,
      summary:
        storeInfo?.address
          ? `${storeName} icin girdiginiz adres ve iletisim bilgileri burada premium bir vitrinde gosterilir.`
          : `${storeName} icin adres ve iletisim bilgilerini adminden tamamladiginizda bu alan tam magaza deneyimine donusur.`,
      hours: "Pzt - Cmt / 10:00 - 19:00",
      address,
      actionHref: mapUrl,
      actionLabel: storeInfo?.address ? "Harita" : "Detaylari Ac",
      icon: <MapPin className="size-4" />,
    },
    {
      id: "support",
      badge: "Iletisim",
      name: "Destek ve Teklif Hatti",
      summary:
        "Kurumsal talepler, teslimat sorulari ve musteri destek akislari ayarlardan gelen telefon ve e-posta ile otomatik guncellenir.",
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
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            {eyebrow}
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[#18110B] sm:text-4xl">
            {heading}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#69584A] sm:text-[15px]">
            {description}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 lg:grid-cols-4 lg:gap-4">
          {galleryImages.map((image, index) => (
            <div key={image.id} className="group relative overflow-hidden bg-[#E7DED3]">
              <div className="relative aspect-[5/5.8]">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  priority={index < 2}
                  sizes="(min-width: 1280px) 24vw, (min-width: 768px) 25vw, 50vw"
                  className="object-cover transition duration-700 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/28 via-black/0 to-transparent" />
                <div className="absolute bottom-3 left-3 rounded-full bg-white/88 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[#4F3A27] backdrop-blur">
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
              className="rounded-[24px] border border-black/6 bg-[#FBF8F4] p-5 shadow-[0_18px_48px_-36px_rgba(42,28,15,0.3)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-[#8A6847]">
                    {card.badge}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#1B130D]">{card.name}</h3>
                </div>

                <a
                  href={card.actionHref}
                  className="inline-flex items-center gap-2 rounded-full border border-[#C7A985] bg-white px-3.5 py-2 text-sm font-medium text-[#3B2A1E] transition hover:border-[#8B6A48] hover:bg-white"
                >
                  {card.icon}
                  <span>{card.actionLabel}</span>
                </a>
              </div>

              <p className="mt-4 max-w-xl text-sm leading-7 text-[#5C4B40]">{card.summary}</p>

              <div className="mt-5 space-y-3 text-sm text-[#4D3C2F]">
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                  <Clock3 className="size-4 text-[#8C6D4C]" />
                  <span>{card.hours}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-1 size-4 text-[#8C6D4C]" />
                  <p className="text-sm leading-6 text-[#6A5A4E]">{card.address}</p>
                </div>
                <div className="flex flex-wrap gap-5 text-[#6A5A4E]">
                  <span className="inline-flex items-center gap-2">
                    <Phone className="size-4 text-[#8C6D4C]" />
                    {phone}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Mail className="size-4 text-[#8C6D4C]" />
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
            className="inline-flex items-center gap-2 rounded-full border border-[#B99874] bg-white px-5 py-3 text-sm font-medium text-[#3F2E22] transition hover:border-[#8B6A48] hover:bg-[#FFF9F2]"
          >
            <span>{linkLabel}</span>
            <ExternalLink className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
