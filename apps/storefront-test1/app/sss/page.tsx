import Link from "next/link";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { buildLocalizedPath } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const FAQ_ITEMS = [
  {
    question: "Magaza bilgileri nereden yonetiliyor?",
    answer:
      "Marka adi, iletisim, adres, duyuru, banner ve benzeri bilgiler admin panelindeki genel ayarlardan yonetilir ve storefronta otomatik yansir.",
    category: "Yonetim",
  },
  {
    question: "Urun ve kategori sayfalari nasil doluyor?",
    answer:
      "Yayindaki urunler, kategoriler ve koleksiyon iliskileri veritabanindan cekilir. Homepage vitrinleri de aktif urun ve kategori verisine gore guncellenir.",
    category: "Katalog",
  },
  {
    question: "Yorumlar ana sayfada nasil gorunur?",
    answer:
      "Onaylanan urun yorumlari premium testimonial alanina otomatik tasinir. Yorum yoksa starter theme, gecici placeholder icerik gosterir.",
    category: "Yorumlar",
  },
  {
    question: "Teslimat ve iade metinleri sonradan degistirilebilir mi?",
    answer:
      "Evet. Kurumsal ve destek sayfalari marka bilgileriyle calisir; gerekli metinler panelden guncellenebilir veya store-specific olarak genisletilebilir.",
    category: "Operasyon",
  },
  {
    question: "Bu storefront yeni magazalar icin tekrar kullanilabilir mi?",
    answer:
      "Evet. Premium starter theme mantigi ayni omurgayi korur; marka renkleri, tipografi, icerik ve koleksiyon kurgusu sonradan ozellestirilir.",
    category: "Theme",
  },
  {
    question: "Destek ekibine nasil ulasirim?",
    answer:
      "Iletisim sayfasindaki telefon ve e-posta alanlari genel ayarlardan gelir. Oradaki bilgiler bu sayfada da referans olarak kullanilir.",
    category: "Destek",
  },
] as const;

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/sss",
    title: `Sikca Sorulan Sorular | ${profile.name}`,
    description:
      `${profile.name} icin siparis, icerik, vitrin ve destek akislarini anlatan yardim merkezi.`,
  });
}

export default async function FAQPage() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();
  const grouped = FAQ_ITEMS.reduce<Record<string, typeof FAQ_ITEMS>>((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof FAQ_ITEMS>);

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Yardim Merkezi
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Sik sorulan konulari tek merkezde toplayin
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#6B5A4D]">
            {profile.name} icin siparis, katalog, vitrin ve destek akislarina dair en cok sorulan
            sorular bu sayfada yer alir.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          {Object.entries(grouped).map(([category, items]) => (
            <article
              key={category}
              className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8A6847]">
                {category}
              </p>
              <div className="mt-5 space-y-5">
                {items.map((item) => (
                  <div key={item.question} className="border-t border-black/6 pt-5 first:border-t-0 first:pt-0">
                    <h2 className="text-xl font-semibold text-[#18110B]">{item.question}</h2>
                    <p className="mt-3 text-sm leading-7 text-[#5F5147]">{item.answer}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-[32px] bg-[#11192D] px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/65">
            Hala yardim gerekiyor mu?
          </p>
          <h2 className="mt-3 text-3xl font-semibold">Destek noktasina gecin</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/78">
            Genel ayarlardaki iletisim bilgileriyle ekibinize ulasmak icin iletisim sayfasina
            yonlenin veya dogrudan e-posta gonderin.
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
