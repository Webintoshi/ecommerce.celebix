import Link from "next/link";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { buildLocalizedPath } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/hakkimizda",
    title: `Hakkimizda | ${profile.name}`,
    description:
      `${profile.name} marka hikayesi, magaza bilgileri ve premium storefront altyapisi hakkinda genel bilgilendirme.`,
  });
}

export default async function AboutPage() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  const pillars = [
    {
      title: "Adminden yonetilen vitrin",
      text: "Banner, kategori, urun ve yorum alanlari dogrudan yonetim panelinden beslenir.",
    },
    {
      title: "Markaya gore sekillenen tema",
      text: "Renk, tipografi ve icerik bloklari yeni magaza acilislarinda hizla ozellestirilir.",
    },
    {
      title: "Kurumsal guven zemini",
      text: "Iletisim, teslimat, iade ve kurumsal sayfalar temel hazirlikla otomatik gelir.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Marka Profili
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            {profile.name}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#6B5A4D]">
            {profile.tagline}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]"
            >
              <h2 className="text-2xl font-semibold text-[#18110B]">{pillar.title}</h2>
              <p className="mt-4 text-sm leading-7 text-[#5F5147]">{pillar.text}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-[32px] bg-[#11192D] px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/65">
            Iletisim
          </p>
          <h2 className="mt-3 text-3xl font-semibold">Markanizla ilgili tum detaylari acik tutun</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/78">
            Adres, telefon ve e-posta alanlari adminden guncellendiginde bu sayfa da otomatik olarak
            senkron kalir.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={buildLocalizedPath("/iletisim", locale)}
              className="rounded-full bg-white px-5 py-3 text-sm font-medium text-[#11192D] transition hover:bg-[#F4ECE5]"
            >
              Iletisim sayfasina git
            </Link>
            <a
              href={`mailto:${profile.email}`}
              className="rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {profile.email}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
