import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/mesafeli-satis-sozlesmesi",
    title: `Mesafeli Satis Sozlesmesi | ${profile.name}`,
    description:
      `${profile.name} icin mesafeli satis sureclerine dair temel bilgilendirme metni.`,
  });
}

export default async function DistanceSalesAgreementPage() {
  const profile = await getStorefrontProfile();

  const sections = [
    "Bu storefront uzerinden verilen siparisler, odeme ve teslimat onayi sonrasinda kesinlesir.",
    "Urunlerin niteligi, teslimat kosullari ve iade surecleri ilgili politika sayfalariyla birlikte degerlendirilir.",
    "Musteri ile iletisim, teslimat ve destek adimlari icin store ayarlarindaki resmi iletisim bilgileri kullanilir.",
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Mesafeli Satis
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Mesafeli satis sozlesmesi
          </h1>
          <p className="mt-5 text-base leading-8 text-[#6B5A4D]">
            Bu sayfa, markaya ozel hukuk metinleri hazir olana kadar profesyonel bir temel cerceve sunar.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_20px_50px_-42px_rgba(41,24,15,0.35)]">
          <div className="space-y-5 text-sm leading-7 text-[#5F5147]">
            {sections.map((section) => (
              <p key={section}>{section}</p>
            ))}
            <p>
              Guncel iletisim kayitlari: {profile.name} / {profile.email} / {profile.phone}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
