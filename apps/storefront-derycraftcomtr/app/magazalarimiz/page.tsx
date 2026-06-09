import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StoreLocationPanel } from "@/components/sections/redesign/StoreLocationsSection";
import { STORE_LOCATIONS } from "@/lib/store-locations";
import { buildLocalizedPath } from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { buildStorePageMetadata } from "@/lib/seo-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/magazalarimiz",
    title: `Mağazalarımız | ${profile.name}`,
    description:
      "Giresun ve Ordu mağazalarımızda deri koleksiyonlarını yakından inceleyin. Atölye, showroom ve kişiye özel sipariş için adres ve iletişim bilgileri.",
  });
}

export default async function StoresPage() {
  const locale = await getRequestLocale();
  const routing = await getLocaleRoutingConfig();
  const profile = await getStorefrontProfile();
  const contactHref = buildLocalizedPath("/iletisim", locale, routing);

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="container-premium py-14 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B6914]">
              Mağazalarımız
            </p>
            <h1 className="mt-4 font-serif text-[2.15rem] font-medium leading-[1.08] tracking-tight text-neutral-950 sm:text-[2.75rem]">
              Deriye yakından dokunun
            </h1>
            <p className="mt-5 text-sm leading-7 text-neutral-600 sm:text-[15px]">
              {profile.name} olarak Giresun ve Ordu&apos;daki mağazalarımızda hakiki deri
              koleksiyonlarımızı, atölye detaylarını ve kişiye özel üretim seçeneklerini
              yerinde keşfedebilirsiniz.
            </p>
          </div>
        </div>
      </section>

      <section className="container-premium py-12 sm:py-16 lg:py-20">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:gap-10">
          {STORE_LOCATIONS.map((store, index) => (
            <StoreLocationPanel
              key={store.id}
              store={store}
              index={index}
              priority={index === 0}
            />
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl rounded-[1.75rem] border border-[#E5D9CA] bg-[#FBF8F4] px-6 py-8 text-center sm:px-10 sm:py-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8B6914]">
            Randevu &amp; bilgi
          </p>
          <h2 className="mt-3 font-serif text-2xl text-neutral-950 sm:text-[1.75rem]">
            Mağaza ziyareti veya kurumsal talepleriniz için bize ulaşın
          </h2>
          <p className="mt-4 text-sm leading-7 text-neutral-600">
            Kişiye özel üretim, toplu sipariş veya mağaza ziyareti planlamak için iletişim
            formumuzu kullanabilirsiniz.
          </p>
          <Link
            href={contactHref}
            className="mt-7 inline-flex items-center gap-2 border border-neutral-900 px-7 py-3.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white"
          >
            İletişime geç
            <ArrowUpRight className="size-4" strokeWidth={1.75} />
          </Link>
        </div>
      </section>
    </div>
  );
}
