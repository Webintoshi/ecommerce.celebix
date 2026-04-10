import { Mail, MapPin, Phone } from "lucide-react";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/iletisim",
    title: `Iletisim | ${profile.name}`,
    description:
      `${profile.name} ile destek, teklif, toptan satis ve proje talepleri icin iletisime gecin.`,
  });
}

export default async function ContactPage() {
  const profile = await getStorefrontProfile();

  const cards = [
    {
      title: "Adres",
      value: profile.address,
      href: profile.mapSearchUrl,
      icon: MapPin,
      linkLabel: "Haritada Ac",
    },
    {
      title: "E-posta",
      value: profile.email,
      href: `mailto:${profile.email}`,
      icon: Mail,
      linkLabel: "Mail Gonder",
    },
    {
      title: "Telefon",
      value: profile.phone,
      href: `tel:${profile.phoneLink}`,
      icon: Phone,
      linkLabel: "Hemen Ara",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
              Iletisim
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
              {profile.name} ile ayni gun baglanti kurun
            </h1>
            <p className="mt-5 text-base leading-8 text-[#6B5A4D]">
              Genel ayarlarda girdiginiz iletisim bilgileri bu sayfayi otomatik olarak
              premium bir destek merkezine donusturur. Teklif, destek ve proje talepleriniz
              icin dogrudan baglanabilirsiniz.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <article
                key={card.title}
                className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7B1113]/8 text-[#7B1113]">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8A6847]">
                  {card.title}
                </p>
                <p className="mt-3 text-base leading-7 text-[#221813]">{card.value}</p>
                <a
                  href={card.href}
                  className="mt-5 inline-flex items-center rounded-full border border-[#C7A985] px-4 py-2 text-sm font-medium text-[#3B2A1E] transition hover:border-[#8B6A48] hover:bg-[#FFF9F2]"
                >
                  {card.linkLabel}
                </a>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
