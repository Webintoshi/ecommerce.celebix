import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/iade",
    title: `Teslimat ve Iade Politikasi | ${profile.name}`,
    description:
      `${profile.name} icin teslimat, iade ve degisim sureclerine dair genel bilgilendirme.`,
  });
}

export default async function ReturnsPage() {
  const profile = await getStorefrontProfile();

  const steps = [
    "Teslim aldiginiz urunu siparis detaylariyla birlikte kontrol edin.",
    `Iade veya degisim talebinizi ${profile.email} adresine iletin.`,
    "Onay sonrasi urunu orijinal durumunu koruyarak gonderin.",
    "Inceleme tamamlandiginda sonuc ve odeme bilgilendirmesi tarafiniza ulasir.",
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Teslimat ve Iade
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Teslimat ve iade sureci
          </h1>
          <p className="mt-5 text-base leading-8 text-[#6B5A4D]">
            Her magaza kendi operasyon planina gore teslimat ve iade kurallarini netlestirebilir.
            Bu sayfa storefront icinde profesyonel bir temel politika alani olarak hazir gelir.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_20px_50px_-42px_rgba(41,24,15,0.35)]">
          <h2 className="text-2xl font-semibold text-[#18110B]">Iade adimlari</h2>
          <ol className="mt-6 space-y-4">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7B1113]/8 text-sm font-semibold text-[#7B1113]">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-7 text-[#5F5147]">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
