import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/gizlilik",
    title: `Gizlilik Politikasi | ${profile.name}`,
    description:
      `${profile.name} tarafindan toplanan veriler, kullanimi ve iletisim surecleri hakkinda ozet gizlilik bilgilendirmesi.`,
  });
}

export default async function PrivacyPage() {
  const profile = await getStorefrontProfile();

  const sections = [
    {
      title: "Hangi verileri topluyoruz?",
      body:
        "Siparis, teslimat, odeme ve destek sureclerini yurutmek icin ad, adres, telefon, e-posta, siparis icerigi ve teknik oturum bilgileri islenebilir.",
    },
    {
      title: "Bu verileri neden kullaniyoruz?",
      body:
        "Siparisleri tamamlamak, musteriyi bilgilendirmek, iade ve teslimat sureclerini yonetmek, sahteciligi azaltmak ve storefront deneyimini gelistirmek icin kullaniriz.",
    },
    {
      title: "Veriler kimlerle paylasilabilir?",
      body:
        "Odeme, kargo, barindirma ve yasal zorunluluklar kapsamindaki hizmet saglayicilarla yalnizca gereken asgari veriler paylasilir.",
    },
    {
      title: "Haklariniz nelerdir?",
      body:
        "Verilerinize erisim, duzeltme, silme veya iletisim tercihlerini guncelleme taleplerinizi bize iletebilirsiniz.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Gizlilik
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Gizlilik politikasi
          </h1>
          <p className="mt-5 text-base leading-8 text-[#6B5A4D]">
            {profile.name} uzerinden toplanan siparis ve iletisim verilerinin nasil
            kullanildigina dair kisa bilgilendirme.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <div className="space-y-6">
          {sections.map((section) => (
            <article
              key={section.title}
              className="rounded-[24px] border border-black/5 bg-white p-6 shadow-[0_20px_50px_-42px_rgba(41,24,15,0.35)]"
            >
              <h2 className="text-2xl font-semibold text-[#18110B]">{section.title}</h2>
              <p className="mt-4 text-sm leading-7 text-[#5F5147]">{section.body}</p>
            </article>
          ))}

          <article className="rounded-[24px] border border-black/5 bg-white p-6 shadow-[0_20px_50px_-42px_rgba(41,24,15,0.35)]">
            <h2 className="text-2xl font-semibold text-[#18110B]">Iletisim</h2>
            <p className="mt-4 text-sm leading-7 text-[#5F5147]">
              Gizlilik veya veri talepleriniz icin bize {profile.email} adresinden
              veya {profile.phone} numarasindan ulasabilirsiniz.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
