import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/kvkk",
    title: `KVKK | ${profile.name}`,
    description:
      `${profile.name} icin kisisel verilerin korunmasi ve aydinlatma kapsaminda temel bilgilendirme.`,
  });
}

export default async function KvkkPage() {
  const profile = await getStorefrontProfile();

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            KVKK
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Kisisel verilerin korunmasi
          </h1>
          <p className="mt-5 text-base leading-8 text-[#6B5A4D]">
            Bu alan, veri isleme ve aydinlatma metinlerinin markaya gore sonradan ozellestirilmesi
            icin profesyonel bir temel sunar.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <div className="space-y-6">
          {[
            "Siparis, teslimat, iletisim ve destek surecleri kapsaminda gerekli veriler sinirli ve amaca uygun bicimde islenir.",
            "Veri talepleri, duzeltme ve silme basvurulari resmi iletisim kanallari uzerinden degerlendirilir.",
            "Store ayarlarindan guncellenen iletisim bilgileri bu sayfa ve diger hukuk metinlerine otomatik olarak yansitilabilir.",
          ].map((item) => (
            <article
              key={item}
              className="rounded-[24px] border border-black/5 bg-white p-6 shadow-[0_20px_50px_-42px_rgba(41,24,15,0.35)]"
            >
              <p className="text-sm leading-7 text-[#5F5147]">{item}</p>
            </article>
          ))}

          <article className="rounded-[24px] border border-black/5 bg-white p-6 shadow-[0_20px_50px_-42px_rgba(41,24,15,0.35)]">
            <p className="text-sm leading-7 text-[#5F5147]">
              Veri sorumlusu ile iletisim: {profile.name} / {profile.email} / {profile.phone}
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
