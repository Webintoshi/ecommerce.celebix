import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { buildLocalizedPath } from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getProductBySlug } from "@/lib/products";
import { CORPORATE_SHOWCASE_SLUGS } from "@/lib/corporate-products";
import { getCartItemDisplayImage } from "@/lib/product-images";
import type { Product } from "@/types/product";
import CorporateProductsClient from "./CorporateProductsClient";
import { generateFAQSchema } from "@/lib/seo-schema";
import { DEFAULT_FLOATING_FAQ_ITEMS } from "@/lib/floating-faq";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/kurumsal-urunler",
    title: `Kurumsal Ürünler | ${profile.name}`,
    description:
      "Şirketinize özel deri hediyeler, logo baskılı kurumsal ürünler ve toplu sipariş çözümleri. Kişiselleştirilmiş kurumsal hediyelerle markanıza prestij katın.",
  });
}

async function getShowcaseProducts(): Promise<Product[]> {
  const results = await Promise.all(
    CORPORATE_SHOWCASE_SLUGS.map((slug) => getProductBySlug(slug)),
  );

  return results.filter((product): product is Product => Boolean(product));
}

export default async function CorporateProductsPage() {
  const locale = await getRequestLocale();
  const routing = await getLocaleRoutingConfig();
  const contactHref = buildLocalizedPath("/iletisim", locale, routing);
  const showcaseProducts = await getShowcaseProducts();

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateFAQSchema(DEFAULT_FLOATING_FAQ_ITEMS)),
        }}
      />

      <section className="relative flex min-h-[420px] items-center justify-center overflow-hidden sm:min-h-[480px] lg:min-h-[560px]">
        <div className="absolute inset-0">
          <Image
            src="/kurumsal-hero.jpg"
            alt="Kurumsal deri ürünler"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-black/80" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 py-16 text-center sm:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] !text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)] sm:text-[11px]">
            Şirketinize özel ürünlerle kalıcı iz bırakın
          </p>
          <h1 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight !text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:text-4xl lg:text-5xl">
            Markanıza prestij katın
          </h1>
          <Link
            href={contactHref}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#12100D] transition-colors hover:bg-[#FAF7F2]"
          >
            Teklif al
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        </div>
      </section>

      <section className="border-b border-[#E8DFD3] bg-[#FAF7F2] py-14 sm:py-16 lg:py-20">
        <div className="container-premium">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-serif text-2xl text-[#12100D] sm:text-3xl lg:text-[2rem]">
              Kişiselleştirilmiş hediyelerle bir adım öne geçin
            </h2>
            <div className="mt-6 space-y-4 text-sm leading-7 text-neutral-600 sm:text-[15px]">
              <p>
                Kurumsal müşterilerimizin ihtiyaçlarını anlıyor ve onlara özel tasarım, kalite ve
                hizmet sunuyoruz.
              </p>
              <p>
                Deri ürünlerimiz, şirketinizin imajını yansıtacak şekilde özenle tasarlanır.
              </p>
              <p>
                Toplu siparişlerde özel tasarımlarla her detayı düşünerek sizin için en iyi
                çözümleri üretiyoruz.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#E8DFD3] bg-white py-14 sm:py-16 lg:py-20">
        <div className="container-premium">
          <div className="mb-10 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B6914]">
              Keşfedin
            </p>
            <h2 className="mt-3 font-serif text-2xl text-[#12100D] sm:text-3xl">
              Kurumsal ürünlerimiz
            </h2>
          </div>

          {showcaseProducts.length > 0 ? (
            <div className="mx-auto grid max-w-5xl grid-cols-2 gap-5 sm:gap-6 lg:grid-cols-4 lg:gap-8">
              {showcaseProducts.map((product) => {
                const primaryImage = resolveStorefrontAssetUrl(
                  getCartItemDisplayImage(product, product.variants?.[0] ?? null),
                );
                const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);
                const productHref = buildLocalizedPath(`/urunler/${product.slug}`, locale, routing);

                return (
                  <Link
                    key={product.id}
                    href={productHref}
                    className="group block"
                  >
                    <div className="relative mb-3 aspect-square overflow-hidden rounded-xl border border-[#E8DFD3] bg-[#FAF7F2]">
                      {primaryImage ? (
                        <Image
                          src={primaryImage}
                          alt={product.name}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          unoptimized={usesProxiedPrimaryImage}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
                          Görsel yok
                        </div>
                      )}
                    </div>
                    <h3 className="line-clamp-2 text-sm font-medium leading-snug text-[#12100D] transition-colors group-hover:text-[#8A6B37]">
                      {product.name}
                    </h3>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-neutral-500">
              Ürünler şu anda yüklenemedi. Lütfen daha sonra tekrar deneyin.
            </div>
          )}
        </div>
      </section>

      <CorporateProductsClient contactHref={contactHref} />
    </div>
  );
}
