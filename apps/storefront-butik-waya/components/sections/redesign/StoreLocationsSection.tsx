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
          city: "Lookbook",
        })),
    ),
    ...(promoBanners || []).flatMap((banner, index) =>
      [banner.image, banner.mobileImage]
        .filter((image): image is string => Boolean(image))
        .map((image, imageIndex) => ({
          id: `promo-${index}-${imageIndex}`,
          src: image,
          alt: banner.title || `${storeName} koleksiyon gorseli`,
          city: "Studio",
        })),
    ),
  ].slice(0, 4);

  if (realImages.length > 0) {
    return realImages;
  }

  return [
    { id: "placeholder-1", src: "/placeholders/promo-banner-1.svg", alt: `${storeName} taslak gorunum 1`, city: "Studio" },
    { id: "placeholder-2", src: "/placeholders/promo-banner-2.svg", alt: `${storeName} taslak gorunum 2`, city: "Wardrobe" },
    { id: "placeholder-3", src: "/placeholders/promo-banner-3.svg", alt: `${storeName} taslak gorunum 3`, city: "Atelier" },
    { id: "placeholder-4", src: "/placeholder.svg", alt: `${storeName} taslak gorunum 4`, city: "Preview" },
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
  const address = storeInfo?.address || "Adres bilgisi tanimlandiginda bu alan concierge notu olarak otomatik dolar.";
  const phone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const email = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const galleryImages = buildGalleryImages({ heroBanners, promoBanners, storeName });
  const mapUrl = storeInfo?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeInfo.address)}`
    : storesHref;

  const cards = [
    {
      id: "main",
      badge: "Appointment Note",
      name: `${storeName} Studio`,
      summary:
        storeInfo?.address
          ? `${storeName} icin girdiginiz adres ve gorsel bilgiler, butik ziyaretini guclendiren bir davet katmanina donusur.`
          : `${storeName} icin adres ve servis detaylari girildiginde bu alan dogrudan studio davetine cevrilir.`,
      hours: "Pzt - Cmt / 10:00 - 19:00",
      address,
      actionHref: mapUrl,
      actionLabel: storeInfo?.address ? "Haritada ac" : "Detayi ac",
      icon: <MapPin className="size-4" />,
    },
    {
      id: "support",
      badge: "Private Concierge",
      name: "Destek ve stil hatti",
      summary:
        "Siparis yardimi, beden sorulari ve kurumsal talepler tek noktadan yanitlanir; telefon ve e-posta alanlari ayarlardan otomatik okunur.",
      hours: "Hafta ici hizli geri donus",
      address: `${phone} / ${email}`,
      actionHref: `mailto:${email}`,
      actionLabel: "Mail gonder",
      icon: <Mail className="size-4" />,
    },
  ];

  return (
    <section className="py-16 sm:py-20">
      <div className="container-premium">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <div>
            <p className="editorial-kicker">{eyebrow}</p>
            <h2 className="mt-5 font-serif text-4xl leading-[0.95] tracking-[-0.045em] text-[#1d1715] sm:text-5xl">
              {heading}
            </h2>
            <p className="editorial-copy mt-5 max-w-xl text-sm sm:text-base">{description}</p>

            <div className="mt-8 space-y-4">
              {cards.map((card) => (
                <article
                  key={card.id}
                  className="rounded-[2rem] border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.9)] p-6 shadow-[0_24px_70px_-50px_rgba(0,0,0,0.24)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.26em] text-[#6f6a65]">{card.badge}</p>
                      <h3 className="mt-3 font-serif text-3xl leading-none tracking-[-0.04em] text-[#1d1715]">
                        {card.name}
                      </h3>
                    </div>
                    <a
                      href={card.actionHref}
                      className="inline-flex items-center gap-2 rounded-full border border-[rgba(26,26,26,0.1)] bg-white/75 px-4 py-2 text-sm font-medium text-[#1d1715] hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                    >
                      {card.icon}
                      <span>{card.actionLabel}</span>
                    </a>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-[#5f524a]">{card.summary}</p>

                  <div className="mt-5 space-y-3 text-sm text-[#5f524a]">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(35,24,21,0.08)] bg-white px-3 py-2">
                      <Clock3 className="size-4 text-[#6f6a65]" />
                      <span>{card.hours}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-1 size-4 text-[#6f6a65]" />
                      <p className="leading-6">{card.address}</p>
                    </div>
                    <div className="flex flex-wrap gap-5">
                      <span className="inline-flex items-center gap-2">
                        <Phone className="size-4 text-[#6f6a65]" />
                        {phone}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Mail className="size-4 text-[#6f6a65]" />
                        {email}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8">
              <Link
                href={storesHref}
                className="inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white hover:bg-[#2A2A2A]"
              >
                <span>{linkLabel}</span>
                <ExternalLink className="size-4" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {galleryImages.map((image, index) => (
              <div
                key={image.id}
                className={`group relative overflow-hidden rounded-[2rem] border border-[rgba(35,24,21,0.08)] ${
                  index === 0 ? "col-span-2" : ""
                }`}
              >
                <div className={`relative ${index === 0 ? "aspect-[16/10]" : "aspect-[4/5]"}`}>
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    priority={index < 2}
                    sizes={index === 0 ? "(max-width: 1024px) 100vw, 60vw" : "(max-width: 1024px) 50vw, 28vw"}
                    className="object-cover transition duration-700 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,12,10,0.04),rgba(20,12,10,0.68))]" />
                  <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/15 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-white/78 backdrop-blur">
                    {image.city}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
