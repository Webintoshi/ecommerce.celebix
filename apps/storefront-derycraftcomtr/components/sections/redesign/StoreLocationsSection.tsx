import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock3, MapPin, Phone } from "lucide-react";
import {
  resolveStorefrontAssetUrl,
  resolveStorefrontDirectAssetUrl,
} from "@/lib/asset-url";
import { STORE_LOCATIONS, type StoreLocation } from "@/lib/store-locations";
import { cn } from "@/lib/utils";

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
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  const proxiedSource = resolveStorefrontAssetUrl(src);
  const directSource = resolveStorefrontDirectAssetUrl(src);
  const imageSource = proxiedSource || directSource;

  if (!imageSource) {
    return <div className={cn("h-full w-full bg-[#E7DED3]", className)} />;
  }

  return (
    <Image
      src={imageSource}
      alt={alt}
      fill
      priority={priority}
      unoptimized
      sizes="(min-width: 1280px) 28vw, (min-width: 768px) 40vw, 90vw"
      className={cn("object-cover transition duration-700 group-hover:scale-[1.03]", className)}
    />
  );
}

function GalleryTile({
  src,
  alt,
  city,
  priority = false,
  className,
}: {
  src: string;
  alt: string;
  city: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("group relative overflow-hidden bg-[#E7DED3]", className)}>
      <div className="relative aspect-[4/5] sm:aspect-[5/6]">
        <LocationImage src={src} alt={alt} priority={priority} />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/45 via-neutral-950/5 to-transparent" />
        <div className="absolute bottom-4 left-4">
          <span className="inline-flex items-center rounded-full border border-white/25 bg-white/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-800 backdrop-blur-sm">
            {city}
          </span>
        </div>
      </div>
    </div>
  );
}

function StorePanel({
  store,
  index,
  priority = false,
}: {
  store: StoreLocation;
  index: number;
  priority?: boolean;
}) {
  const heroImage = store.images[0];

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-[#E5D9CA] bg-[#FBF8F4] shadow-[0_20px_50px_-36px_rgba(62,42,24,0.35)]">
      <div className="grid flex-1 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="relative min-h-[240px] overflow-hidden bg-[#E7DED3] sm:min-h-[280px] md:min-h-[340px]">
          <LocationImage
            src={heroImage}
            alt={store.name}
            priority={priority}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/30 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-[#FBF8F4]/20" />
        </div>

        <div className="flex flex-col justify-between p-6 sm:p-8">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8B6914]">
                  {store.badge}
                </p>
                <h3 className="mt-2 font-serif text-[1.65rem] leading-tight text-neutral-950 sm:text-[1.85rem]">
                  {store.name}
                </h3>
              </div>
              <span className="font-serif text-3xl leading-none text-[#E5D9CA]">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>

            <p className="mt-5 text-sm leading-7 text-neutral-600">{store.summary}</p>
          </div>

          <div className="mt-8 space-y-4 border-t border-[#E5D9CA]/80 pt-6">
            <div className="flex items-center gap-3 text-sm text-neutral-700">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E5D9CA] bg-white text-[#8B6914]">
                <Clock3 className="size-4" strokeWidth={1.75} />
              </span>
              <span>{store.hours}</span>
            </div>

            <div className="flex items-start gap-3 text-sm leading-6 text-neutral-600">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E5D9CA] bg-white text-[#8B6914]">
                <MapPin className="size-4" strokeWidth={1.75} />
              </span>
              <span>{store.address}</span>
            </div>

            {store.phone ? (
              <a
                href={`tel:${store.phone.replace(/\s|\(|\)|-/g, "")}`}
                className="flex items-center gap-3 text-sm text-neutral-700 transition-colors hover:text-neutral-950"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E5D9CA] bg-white text-[#8B6914]">
                  <Phone className="size-4" strokeWidth={1.75} />
                </span>
                <span>{store.phone}</span>
              </a>
            ) : null}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={store.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-b border-neutral-900 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-900 transition-colors hover:border-[#8B6914] hover:text-[#8B6914]"
            >
              Yol tarifi al
              <ArrowUpRight className="size-4" strokeWidth={1.75} />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

export function StoreLocationsSection({
  eyebrow = "Mağazalarımız",
  heading = "Deriye yakından dokunun",
  description = "Giresun ve Ordu mağazalarımızda koleksiyonları yakından inceleyin, atölye detaylarını görün ve kişiye özel sipariş seçeneklerini keşfedin.",
  linkLabel = "Tüm şubeleri gör",
  storesHref,
}: StoreLocationsSectionProps) {
  const galleryImages = STORE_LOCATIONS.flatMap((store) =>
    store.images.map((image, imageIndex) => ({
      id: `${store.id}-${imageIndex}`,
      src: image,
      alt: `${store.name} görünüm ${imageIndex + 1}`,
      city: store.city,
    })),
  ).slice(0, 4);

  return (
    <section className="bg-[#F8F8F8F8] py-16 sm:py-20 lg:py-24">
      <div className="container-premium">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-10">
          <div className="lg:col-span-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B6914]">
              {eyebrow}
            </p>
            <h2 className="mt-4 font-serif text-[2rem] font-medium leading-[1.08] tracking-tight text-neutral-950 sm:text-[2.45rem]">
              {heading}
            </h2>
          </div>
          <div className="lg:col-span-7">
            <p className="max-w-2xl text-sm leading-7 text-neutral-600 sm:text-[15px] lg:ml-auto">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-2 sm:mt-12 sm:gap-3 lg:grid-cols-4 lg:gap-4">
          {galleryImages.map((image, index) => (
            <GalleryTile
              key={image.id}
              src={image.src}
              alt={image.alt}
              city={image.city}
              priority={index < 2}
              className={cn(index === 0 && "lg:rounded-tl-[1.25rem]", index === 3 && "lg:rounded-br-[1.25rem]")}
            />
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:mt-10 lg:grid-cols-2 lg:gap-8">
          {STORE_LOCATIONS.map((store, index) => (
            <StorePanel key={store.id} store={store} index={index} priority={index === 0} />
          ))}
        </div>

        <div className="mt-12 flex justify-center lg:mt-14">
          <Link
            href={storesHref}
            className="inline-flex items-center gap-2 border border-neutral-900 px-8 py-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white"
          >
            <span>{linkLabel}</span>
            <ArrowUpRight className="size-4" strokeWidth={1.75} />
          </Link>
        </div>
      </div>
    </section>
  );
}
