import { Scale, Shield, Wallet, ScrollText } from "lucide-react";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/sartlar",
    title: `Kullanim Sartlari | ${profile.name}`,
    description:
      `${profile.name} storefrontunu kullanirken gecerli olan temel kosullar, iletisim ve operasyon prensipleri.`,
  });
}

export default async function TermsPage() {
  const profile = await getStorefrontProfile();

  const sections = [
    {
      title: "Genel Kullanim",
      text: `${profile.name} storefrontu; yayinlanan urunler, sayfalar ve siparis akislari icin resmi dijital vitrin olarak hizmet verir. Siteyi kullanmak, yayindaki politika ve kosullarin kabul edildigi anlamina gelir.`,
      icon: ScrollText,
    },
    {
      title: "Siparis ve Odeme",
      text: "Siparisler, stok ve odeme dogrulamasi sonrasi onaylanir. Fiyatlar, kampanyalar ve operasyon kosullari guncellenebilir; onay anindaki bilgiler siparis icin esas kabul edilir.",
      icon: Wallet,
    },
    {
      title: "Icerik ve Marka Haklari",
      text: "Site icerigi, gorseller, marka unsurlari ve yayinlanan urun kartlari ilgili magaza markasinin operasyonu icin kullanilir. Yetkisiz kopyalama veya kotu niyetli kullanim kabul edilmez.",
      icon: Shield,
    },
    {
      title: "Hukuki Cerceve",
      text: "Uyusmazliklarda ilgili mevzuat, mesafeli satis ve tuketici hukuku esas alinir. Operasyonel iletisim bilgileri bu sayfada ve iletisim bolumunde guncel tutulur.",
      icon: Scale,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Hukuki Cerceve
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Kullanim sartlari sade, acik ve operasyonla uyumlu
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#6B5A4D]">
            {profile.name} icin yayinlanan storefront, siparis ve destek akislarinin temel kosullarini
            bu sayfada toplar.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <article
                key={section.title}
                className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7B1113]/8 text-[#7B1113]">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-[#18110B]">{section.title}</h2>
                <p className="mt-4 text-sm leading-7 text-[#5F5147]">{section.text}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-8 rounded-[32px] bg-[#11192D] px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/65">
            Iletisim ve Bildirim
          </p>
          <h2 className="mt-3 text-3xl font-semibold">{profile.name}</h2>
          <div className="mt-5 space-y-2 text-sm leading-7 text-white/78">
            <p>{profile.address}</p>
            <p>{profile.phone}</p>
            <p>{profile.email}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
