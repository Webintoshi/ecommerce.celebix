import Image from "next/image";
import { Clock3, Mail, MapPin, Phone } from "lucide-react";
import { getHomepageData } from "@/lib/homepage";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

type GalleryImage = {
  id: string;
  src: string;
  alt: string;
};

function buildGalleryImages(
  storeName: string,
  heroBanners: Array<{ desktop: string; mobile: string; alt: string }>,
  promoBanners: Array<{ image?: string; mobileImage?: string; title?: string }>,
): GalleryImage[] {
  const images = [
    ...heroBanners.flatMap((banner, index) =>
      [banner.desktop, banner.mobile]
        .filter(Boolean)
        .map((image, imageIndex) => ({
          id: `hero-${index}-${imageIndex}`,
          src: image,
          alt: banner.alt || `${storeName} vitrin gorunumu`,
        })),
    ),
    ...promoBanners.flatMap((banner, index) =>
      [banner.image, banner.mobileImage]
        .filter((image): image is string => Boolean(image))
        .map((image, imageIndex) => ({
          id: `promo-${index}-${imageIndex}`,
          src: image,
          alt: banner.title || `${storeName} koleksiyon goruntusu`,
        })),
    ),
  ].slice(0, 4);

  if (images.length > 0) {
    return images;
  }

  return [
    {
      id: "placeholder-1",
      src: "/placeholders/promo-banner-1.svg",
      alt: `${storeName} vitrin placeholder 1`,
    },
    {
      id: "placeholder-2",
      src: "/placeholders/promo-banner-2.svg",
      alt: `${storeName} vitrin placeholder 2`,
    },
    {
      id: "placeholder-3",
      src: "/placeholders/promo-banner-3.svg",
      alt: `${storeName} vitrin placeholder 3`,
    },
    {
      id: "placeholder-4",
      src: "/placeholder.svg",
      alt: `${storeName} vitrin placeholder 4`,
    },
  ];
}

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/magazalarimiz",
    title: `Magazalarimiz | ${profile.name}`,
    description:
      `${profile.name} icin fiziksel temas noktalari, iletisim ve showroom bilgileri bu sayfada sunulur.`,
  });
}

export default async function StoresPage() {
  const locale = await getRequestLocale();
  const [profile, homepageData] = await Promise.all([
    getStorefrontProfile(),
    getHomepageData(locale),
  ]);
  const galleryImages = buildGalleryImages(
    profile.name,
    homepageData.heroBanners,
    homepageData.promoBanners as Array<{ image?: string; mobileImage?: string; title?: string }>,
  );

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Magaza Deneyimi
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Fiziksel temas noktalariniz burada canlanir
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#6B5A4D]">
            Admin ayarlarina eklenen adres, telefon, e-posta ve banner gorselleri bu sayfada
            otomatik olarak premium bir magaza vitrini halinde sunulur.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {galleryImages.map((image, index) => (
            <div key={image.id} className="relative overflow-hidden rounded-[28px] bg-[#E7DED3]">
              <div className="relative aspect-[5/5.8]">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  priority={index < 2}
                  sizes="(min-width: 1280px) 24vw, (min-width: 768px) 25vw, 50vw"
                  className="object-cover"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[32px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8A6847]">
              Ana Lokasyon
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-[#18110B]">{profile.name}</h2>
            <p className="mt-4 text-sm leading-7 text-[#5F5147]">{profile.address}</p>
            <div className="mt-6 space-y-3 text-sm text-[#4D3C2F]">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF8F4] px-3 py-2">
                <Clock3 className="h-4 w-4 text-[#8C6D4C]" />
                <span>Pzt - Cmt / 10:00 - 19:00</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#8C6D4C]" />
                <span>{profile.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#8C6D4C]" />
                <span>{profile.email}</span>
              </div>
            </div>
          </article>

          <article className="rounded-[32px] bg-[#11192D] p-6 text-white shadow-[0_24px_60px_-44px_rgba(17,25,45,0.55)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">
              Harita ve Ulasim
            </p>
            <h2 className="mt-3 text-3xl font-semibold">Fiziksel deneyimi guclendirin</h2>
            <p className="mt-4 text-sm leading-7 text-white/75">
              Magaza, atelier, showroom veya deneyim noktalarinizi tek bir premium blokta
              sergileyin. Store ayarlarindaki adres verisi bu akisi otomatik besler.
            </p>
            <a
              href={profile.mapSearchUrl}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-[#11192D] transition hover:bg-[#F4ECE5]"
            >
              <MapPin className="h-4 w-4" />
              Haritada Ac
            </a>
          </article>
        </div>
      </section>
    </div>
  );
}
