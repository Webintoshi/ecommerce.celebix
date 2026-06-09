import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock3, MapPin } from "lucide-react";
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
    return <div className={cn("h-full w-full bg-neutral-200", className)} />;
  }

  return (
    <Image
      src={imageSource}
      alt={alt}
      fill
      priority={priority}
      unoptimized
      sizes="(min-width: 1024px) 50vw, 100vw"
      className={cn("object-cover transition duration-700 group-hover:scale-[1.03]", className)}
    />
  );
}

function StoreLocationCard({
  store,
  priority = false,
  featured = false,
}: {
  store: StoreLocation;
  priority?: boolean;
  featured?: boolean;
}) {
  const heroImage = store.images[0];
  const detailImages = store.images.slice(1, 3);

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[2rem] border border-neutral-200/90 bg-white shadow-[0_24px_60px_-42px_rgba(15,23,42,0.14)]",
        featured && "lg:min-h-[720px]",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden",
          featured ? "aspect-[16/11] lg:aspect-auto lg:min-h-[360px] lg:flex-1" : "aspect-[16/11]",
        )}
      >
        <LocationImage
          src={heroImage}
          alt={store.name}
          priority={priority}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/75 via-neutral-950/15 to-neutral-950/5" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-white/70">
            {store.badge}
          </p>
          <h3 className="mt-3 font-serif text-[1.75rem] leading-tight text-white sm:text-[2rem]">
            {store.name}
          </h3>
        </div>
      </div>

      {detailImages.length > 0 ? (
        <div className={cn("grid gap-px bg-neutral-200/80", detailImages.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {detailImages.map((image, index) => (
            <div key={`${store.id}-detail-${index}`} className="relative aspect-[16/10] overflow-hidden bg-neutral-100">
              <LocationImage src={image} alt={`${store.name} görünüm ${index + 2}`} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-6 sm:p-8">
        <p className="text-sm leading-7 text-neutral-600">{store.summary}</p>

        <div className="mt-6 space-y-3 border-t border-neutral-100 pt-6">
          <div className="flex items-center gap-3 text-sm text-neutral-700">
            <Clock3 className="size-4 shrink-0 text-neutral-400" strokeWidth={1.75} />
            <span>{store.hours}</span>
          </div>
          <div className="flex items-start gap-3 text-sm leading-6 text-neutral-500">
            <MapPin className="mt-0.5 size-4 shrink-0 text-neutral-400" strokeWidth={1.75} />
            <span>{store.address}</span>
          </div>
        </div>

        <a
          href={store.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex w-fit items-center gap-2 text-sm font-medium text-neutral-900 transition-colors hover:text-neutral-600"
        >
          <span>Yol tarifi al</span>
          <ArrowUpRight className="size-4" strokeWidth={1.75} />
        </a>
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
  const [featuredStore, secondaryStore] = STORE_LOCATIONS;

  return (
    <section className="bg-[#F8F8F8F8] py-16 sm:py-20 lg:py-24">
      <div className="container-premium">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-neutral-500">
            {eyebrow}
          </p>
          <h2 className="mt-4 font-serif text-[2rem] font-medium tracking-tight text-neutral-900 sm:text-[2.5rem]">
            {heading}
          </h2>
          <p className="mt-4 text-sm leading-7 text-neutral-500 sm:text-[15px]">{description}</p>
        </div>

        <div className="mt-12 grid gap-6 lg:mt-14 lg:grid-cols-12 lg:gap-8">
          {featuredStore ? (
            <div className="lg:col-span-7">
              <StoreLocationCard store={featuredStore} priority featured />
            </div>
          ) : null}
          {secondaryStore ? (
            <div className="lg:col-span-5">
              <StoreLocationCard store={secondaryStore} />
            </div>
          ) : null}
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
