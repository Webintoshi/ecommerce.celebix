import Image from "next/image";
import Link from "next/link";
import { runProductsQuery } from "@/lib/products-query-compat";
import { createServerClient } from "@/lib/supabase";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { buildLocalizedPath } from "@/lib/i18n";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";

export const dynamic = "force-dynamic";

type CorporateProduct = {
  id: string;
  name: string;
  slug: string;
  image: string;
  price: number | null;
  description: string;
};

async function getCorporateProducts(): Promise<CorporateProduct[]> {
  const supabase = createServerClient();
  const { data, error } = await runProductsQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("products")
      .select("id, name, slug, short_description, description, images, variants:product_variants(price)")
      .order("created_at", { ascending: false })
      .limit(8);

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query.or("status.eq.published,status.is.null");
  });

  if (error || !data) {
    console.error("Corporate products fetch error:", error);
    return [];
  }

  return data.map((product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    image: resolveStorefrontAssetUrl(Array.isArray(product.images) ? product.images[0] : "") || "/placeholder.svg",
    price:
      Array.isArray(product.variants) && product.variants.length > 0
        ? Number(product.variants[0]?.price || 0)
        : null,
    description: product.short_description || product.description || "Kurumsal secenekler icin hazir urun vitrini.",
  }));
}

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/kurumsal-urunler",
    title: `Kurumsal Urunler | ${profile.name}`,
    description:
      `${profile.name} icin kurumsal hediye, premium urun ve marka odakli secenekleri sergileyen showcase sayfasi.`,
  });
}

export default async function CorporateProductsPage() {
  const locale = await getRequestLocale();
  const [profile, products] = await Promise.all([
    getStorefrontProfile(),
    getCorporateProducts(),
  ]);

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#8A6847]">
            Kurumsal Vitrin
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#18110B] sm:text-5xl">
            Markaniz icin premium secenekler hazir
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#6B5A4D]">
            Adminde yayinlanan urunler, bu sayfada kurumsal teklif veya premium hediye akisina
            uygun bir vitrinde sergilenir. Yeni magaza acildiginda ek tasarim eforu olmadan hazir bir
            sunum elde edersiniz.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={`mailto:${profile.email}`}
              className="rounded-full bg-[#7B1113] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#651012]"
            >
              Teklif Al
            </a>
            <Link
              href={buildLocalizedPath("/iletisim", locale)}
              className="rounded-full border border-[#C7A985] px-5 py-3 text-sm font-medium text-[#3B2A1E] transition hover:border-[#8B6A48] hover:bg-[#FFF9F2]"
            >
              Iletisim Sayfasi
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {products.length > 0 ? (
            products.slice(0, 4).map((product) => (
              <Link
                key={product.id}
                href={buildLocalizedPath(`/urunler/${product.slug}`, locale)}
                className="group rounded-[28px] border border-black/5 bg-white p-4 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]"
              >
                <div className="relative aspect-square overflow-hidden rounded-[22px] bg-[#F3ECE4]">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 1280px) 50vw, 25vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-[#18110B]">{product.name}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5F5147]">
                  {product.description}
                </p>
                {typeof product.price === "number" && product.price > 0 ? (
                  <p className="mt-4 text-sm font-semibold text-[#7B1113]">
                    {product.price.toLocaleString("tr-TR")} TL
                  </p>
                ) : null}
              </Link>
            ))
          ) : (
            <article className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)] md:col-span-2 xl:col-span-4">
              <h2 className="text-2xl font-semibold text-[#18110B]">Kurumsal showcase hazir</h2>
              <p className="mt-4 text-sm leading-7 text-[#5F5147]">
                Kurumsal urun vitrini yayina alinacak urunlerle otomatik dolar. Simdilik admin panelden
                urun ve koleksiyon verilerini ekleyerek bu alani tamamlayabilirsiniz.
              </p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
