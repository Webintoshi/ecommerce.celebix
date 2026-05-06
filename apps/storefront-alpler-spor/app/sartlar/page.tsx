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
    title: `Kullanım Şartları | ${profile.name}`,
    description:
      `${profile.name} storefrontunu kullanırken geçerli olan temel koşullar, iletişim ve operasyon prensipleri.`,
  });
}

export default async function TermsPage() {
  const profile = await getStorefrontProfile();

  const sections = [
    {
      title: "Genel Kullanım",
      text: `${profile.name} storefrontu; yayınlanan ürünler, sayfalar ve sipariş akışları için resmi dijital vitrin olarak hizmet verir. Siteyi kullanmak, yayındaki politika ve koşulların kabul edildiği anlamına gelir.`,
      icon: ScrollText,
    },
    {
      title: "Sipariş ve Ödeme",
      text: "Siparişler, stok ve ödeme doğrulaması sonrası onaylanır. Fiyatlar, kampanyalar ve operasyon koşulları güncellenebilir; onay anındaki bilgiler sipariş için esas kabul edilir.",
      icon: Wallet,
    },
    {
      title: "İçerik ve Marka Hakları",
      text: "Site içeriği, görseller, marka unsurları ve yayınlanan ürün kartları ilgili mağaza markasının operasyonu için kullanılır. Yetkisiz kopyalama veya kötü niyetli kullanım kabul edilmez.",
      icon: Shield,
    },
    {
      title: "Hukuki Çerçeve",
      text: "Uyuşmazlıklarda ilgili mevzuat, mesafeli satış ve tüketici hukuku esas alınır. Operasyonel iletişim bilgileri bu sayfada ve iletişim bölümünde güncel tutulur.",
      icon: Scale,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Hukuki Çerçeve
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Kullanım şartları sade, açık ve operasyonla uyumlu
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#6B5A4D]">
            {profile.name} için yayınlanan storefront, sipariş ve destek akışlarının temel koşullarını
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
            İletişim ve Bildirim
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
