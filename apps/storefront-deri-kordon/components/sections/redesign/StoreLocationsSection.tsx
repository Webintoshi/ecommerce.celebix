import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock3, MapPin } from "lucide-react";
import {
  resolveStorefrontAssetUrl,
  resolveStorefrontDirectAssetUrl,
} from "@/lib/asset-url";
import { STORE_LOCATIONS } from "@/lib/store-locations";

interface StoreLocationsSectionProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  linkLabel?: string;
  storesHref: string;
}

function LocationImage({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  const proxiedSource = resolveStorefrontAssetUrl(src);
  const directSource = resolveStorefrontDirectAssetUrl(src);
  const imageSource = proxiedSource || directSource;

  if (!imageSource) {
    return <div className="h-full w-full bg-[#E7DED3]" />;
  }

  return (
    <Image
      src={imageSource}
      alt={alt}
      fill
      priority={priority}
      unoptimized
      sizes="(min-width: 1280px) 24vw, (min-width: 768px) 25vw, 50vw"
      className="object-cover transition duration-700 group-hover:scale-[1.02]"
    />
  );
}

export function StoreLocationsSection({
  eyebrow = "Magazalarimiz",
  heading = "Deriye yakindan dokunun",
  description = "Giresun ve Ordu magazalarimizda koleksiyonlari yakindan inceleyin.",
  linkLabel = "Tum subeleri gor",
  storesHref,
}: StoreLocationsSectionProps) {
  const galleryImages = STORE_LOCATIONS.flatMap((store) =>
    store.images.map((image, index) => ({
      id: `${store.id}-${index}`,
      src: image,
      alt: `${store.name} gorunumu ${index + 1}`,
      city: store.city,
    })),
  ).slice(0, 4);

  return (
    <section className="bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-[1500px] px-5 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
              {eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-[#18110B] sm:text-4xl">
              {heading}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#69584A] sm:text-[15px]">
              {description}
            </p>
          </div>

          <Link
            href={storesHref}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[#B99874] bg-white px-4 py-2.5 text-sm font-medium text-[#3F2E22] transition hover:border-[#8B6A48] hover:bg-[#FFF9F2]"
          >
            <span>{linkLabel}</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-2.5 sm:mt-10 sm:gap-3 lg:grid-cols-4 lg:gap-4">
          {galleryImages.map((image, index) => (
            <div
              key={image.id}
              className="group relative overflow-hidden rounded-[18px] bg-[#E7DED3]"
            >
              <div className="relative aspect-[4/4.6] sm:aspect-[5/5.4]">
                <LocationImage src={image.src} alt={image.alt} priority={index < 2} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/0 to-transparent" />
                <div className="absolute bottom-2.5 left-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#4F3A27] backdrop-blur">
                  {image.city}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {STORE_LOCATIONS.map((store) => (
            <article
              key={store.id}
              className="flex items-center justify-between gap-4 rounded-[18px] border border-black/6 bg-[#FBF8F4] p-4 shadow-[0_14px_36px_-32px_rgba(42,28,15,0.28)]"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A6847]">
                  {store.badge}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-[#1B130D]">{store.name}</h3>
                <div className="mt-2 inline-flex items-center gap-2 text-sm text-[#6A5A4E]">
                  <Clock3 className="size-4 text-[#8C6D4C]" />
                  <span>{store.hours}</span>
                </div>
              </div>

              <a
                href={store.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#C7A985] bg-white px-3.5 py-2 text-sm font-medium text-[#3B2A1E] transition hover:border-[#8B6A48]"
              >
                <MapPin className="size-4" />
                <span>Harita</span>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
