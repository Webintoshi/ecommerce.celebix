import { Truck, ShieldCheck, PackageCheck, MapPinned } from "lucide-react";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/kargo",
    title: `Kargo ve Teslimat | ${profile.name}`,
    description:
      `${profile.name} siparislerinde teslimat akislarinin nasil isledigini, kargo sureclerini ve destek adimlarini inceleyin.`,
  });
}

export default async function ShippingPage() {
  const profile = await getStorefrontProfile();

  const cards = [
    {
      title: "Hazirlama",
      text: "Yayindaki urunler ve siparisler admin panelinden takip edilir. Siparis onayi sonrasinda hazirlama sureci otomatik kayit altina alinir.",
      icon: PackageCheck,
    },
    {
      title: "Teslimat",
      text: "Kargo sureleri sehir, yogunluk ve resmi tatil etkilerine gore degisebilir. Guncel durum siparis akisi ve bildirimlerle desteklenir.",
      icon: Truck,
    },
    {
      title: "Destek",
      text: "Eksik adres, teslimat sorusu veya hasar kaydi gibi durumlarda destek ekibiyle hizli sekilde baglanti kurulabilir.",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#222222]">
            Lojistik Akisi
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#222222] sm:text-5xl">
            Kargo ve teslimat sureci net, premium ve guvenli
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#222222]">
            {profile.name} siparislerinde teslimat akislarini, iletisim noktasini ve operasyon
            guvencelerini bu sayfadan yonetebilirsiniz.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-3">
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
                <h2 className="mt-5 text-2xl font-semibold text-[#222222]">{card.title}</h2>
                <p className="mt-4 text-sm leading-7 text-[#222222]">{card.text}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[32px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#222222]">
              Operasyon Notlari
            </p>
            <ul className="mt-4 space-y-4 text-sm leading-7 text-[#222222]">
              <li>Siparis onayi alinan urunler operasyon durumuna gore hazirlanir ve sevk edilir.</li>
              <li>Teslimat hizi; lokasyon, kargo firmasi yogunlugu ve resmi tatil takvimine bagli olarak degisebilir.</li>
              <li>Adres eksikligi veya teslimat istisnalarinda musteriyle dogrudan baglanti kurulur.</li>
              <li>Hasarli paketler icin teslim aninda tutanak tutturulmasi tavsiye edilir.</li>
            </ul>
          </article>

          <article className="rounded-[32px] bg-[#11192D] p-6 text-white shadow-[0_24px_60px_-44px_rgba(17,25,45,0.55)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                <MapPinned className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">
                  Destek Noktasi
                </p>
                <h2 className="mt-1 text-2xl font-semibold">{profile.name}</h2>
              </div>
            </div>
            <p className="mt-5 text-sm leading-7 text-white/75">{profile.address}</p>
            <div className="mt-6 space-y-2 text-sm text-white/82">
              <p>{profile.phone}</p>
              <p>{profile.email}</p>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
