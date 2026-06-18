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
      <div className="container-premium">
        <div className="grid gap-8 rounded-lg border border-[#D7DEE8] bg-[#0B1220] p-6 text-white shadow-[0_28px_80px_-58px_rgba(15,23,42,0.7)] sm:p-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:p-10">
          <div>
            <p className="text-xs font-semibold uppercase text-[#86EFAC]">
              {eyebrow}
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
              {heading}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-[15px]">
              {description}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href={storesHref}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#FACC15] px-5 py-3 text-sm font-semibold text-[#0B1220] transition hover:bg-[#FDE047]"
              >
                {linkLabel}
                <ExternalLink className="size-4" />
              </Link>
              {phone ? (
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/16 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <Phone className="size-4" />
                  Telefon
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "Doğru ürün yönlendirmesi",
                text: "Araç bilgisi ve kullanım ihtiyacına göre doğru akü seçimini netleştirin.",
                icon: <MapPin className="size-5" />,
              },
              {
                title: "Hızlı destek",
                text: "Sipariş öncesi sorular için telefon ve e-posta kanalları görünür kalır.",
                icon: <Mail className="size-5" />,
              },
              {
                title: "Teslimat bilgisi",
                text: "Kargo ve teslimat seçenekleri sepet/ödeme adımlarında düzenli gösterilir.",
                icon: <Clock3 className="size-5" />,
              },
              {
                title: "Güvenilir alışveriş",
                text: "Ürün, sepet ve ödeme ekranları boş durumda bile net ve güven verici kalır.",
                icon: <ExternalLink className="size-5" />,
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-[#86EFAC]">
                  {item.icon}
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm text-[#526176] md:grid-cols-2">
          <div className="rounded-lg border border-[#D7DEE8] bg-[#F8FAFC] p-4">
            <span className="font-semibold text-[#0B1220]">İletişim:</span> {phone} · {email}
          </div>
          <div className="rounded-lg border border-[#D7DEE8] bg-[#F8FAFC] p-4">
            <span className="font-semibold text-[#0B1220]">Adres/destek:</span> {address}
          </div>
        </div>
      </div>
    </section>
  );
}
