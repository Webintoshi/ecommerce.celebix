import Image from "next/image";
import Link from "next/link";
import { Clock3, ExternalLink, MapPin } from "lucide-react";

const STORE_LOCATIONS = [
  {
    id: "flagship",
    badge: "Flagship",
    name: "Merkez Mağaza",
    city: "İstanbul",
    summary:
      "Yeni mağaza açılışlarında bu alan markanın fiziksel deneyimini, showroom bilgisini veya üretim atölyesini öne çıkarmak için kullanılır.",
    hours: "Pzt - Cmt / 10:00 - 19:00",
    address: "Adres bilgisi owner panelden veya marka onboarding aşamasında güncellenir.",
    mapUrl: "#",
    images: ["/placeholders/promo-banner-1.svg", "/placeholders/promo-banner-2.svg"],
  },
  {
    id: "atelier",
    badge: "Atölye",
    name: "Üretim Alanı",
    city: "İzmir",
    summary:
      "Derycraft’taki güven hissini taşıyan ama mağazaya özel veriler içermeyen placeholder alan. Yeni marka için kolayca değiştirilebilir.",
    hours: "Randevu ile ziyaret",
    address: "Markaya özel mağaza veya atölye bilgisi burada gösterilir.",
    mapUrl: "#",
    images: ["/placeholders/promo-banner-3.svg", "/placeholder.svg"],
  },
] as const;

interface StoreLocationsSectionProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  linkLabel?: string;
  storesHref: string;
}

export function StoreLocationsSection({
  eyebrow = "Mağazalarımız",
  heading = "Markanızı fiziksel dünyada da anlatın",
  description = "Bu alan yeni mağazalarda showroom, butik, atölye veya teslim noktası gibi fiziksel temas alanlarını şık bir şekilde sergilemek için hazır gelir.",
  linkLabel = "Tüm şubeleri gör",
  storesHref,
}: StoreLocationsSectionProps) {
  const galleryImages = STORE_LOCATIONS.flatMap((store) =>
    store.images.map((image, index) => ({
      id: `${store.id}-${index}`,
      src: image,
      alt: `${store.name} görünümü ${index + 1}`,
      city: store.city,
    })),
  ).slice(0, 4);

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
          {STORE_LOCATIONS.map((store) => (
            <article
              key={store.id}
              className="rounded-[24px] border border-black/6 bg-[#FBF8F4] p-5 shadow-[0_18px_48px_-36px_rgba(42,28,15,0.3)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-[#8A6847]">
                    {store.badge}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#1B130D]">{store.name}</h3>
                </div>

                <a
                  href={store.mapUrl}
                  className="inline-flex items-center gap-2 rounded-full border border-[#C7A985] bg-white px-3.5 py-2 text-sm font-medium text-[#3B2A1E] transition hover:border-[#8B6A48] hover:bg-white"
                >
                  <MapPin className="size-4" />
                  <span>Harita</span>
                </a>
              </div>

              <p className="mt-4 max-w-xl text-sm leading-7 text-[#5C4B40]">{store.summary}</p>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[#4D3C2F]">
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                  <Clock3 className="size-4 text-[#8C6D4C]" />
                  <span>{store.hours}</span>
                </div>
                <p className="text-sm leading-6 text-[#6A5A4E]">{store.address}</p>
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
