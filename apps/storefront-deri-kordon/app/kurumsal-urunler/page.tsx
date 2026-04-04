import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { runProductsQuery } from "@/lib/products-query-compat";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import type { Product } from "@/types/product";
import CorporateProductsClient from "./CorporateProductsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kurumsal Ürünler | Deri Kordon",
  description:
    "Şirketinize özel deri ürünler ve kişiselleştirilmiş kurumsal hediyeler. Markanıza prestij katın.",
};

interface DBProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  images: string[] | null;
  images_v2?: Array<{ url?: string } | string> | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  is_featured: boolean | null;
  is_new: boolean | null;
  vegan: boolean | null;
  gluten_free: boolean | null;
  sugar_free: boolean | null;
  high_protein: boolean | null;
  rating: number | null;
  review_count: number | null;
  seo_title: string | null;
  seo_description: string | null;
}

const TARGET_PRODUCTS = [
  { displayName: "Çıtçıtlı Deri Kalemlik", searchName: "Çıtçıtlı Deri Kalemlik" },
  { displayName: "Deri AirPods Kılıfı", searchName: "Deri Airpods Kılıfı" },
  { displayName: "Deri AirTag Kılıfı", searchName: "Deri Airtag Kılıfı" },
  { displayName: "Deri Bardak Altlığı", searchName: "Deri Bardak Altlığı" },
];

function transformProduct(product: DBProduct): Product {
  const fallbackImages =
    product.images && product.images.length > 0
      ? product.images
      : (product.images_v2 || [])
          .map((image) => (typeof image === "string" ? image : image?.url || ""))
          .filter((image) => image.length > 0);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description || "",
    shortDescription: product.short_description || "",
    category: ((product.category || "genel") as unknown) as Product["category"],
    subcategory: ((product.subcategory || "genel") as unknown) as Product["subcategory"],
    images: fallbackImages,
    tags: product.tags || [],
    variants: [],
    vegan: Boolean(product.vegan),
    glutenFree: Boolean(product.gluten_free),
    sugarFree: Boolean(product.sugar_free),
    highProtein: Boolean(product.high_protein),
    rating: Number(product.rating || 0),
    reviewCount: Number(product.review_count || 0),
    featured: Boolean(product.is_featured),
    new: Boolean(product.is_new),
    seoTitle: product.seo_title || undefined,
    seoDescription: product.seo_description || undefined,
  };
}

async function getProducts(): Promise<Product[]> {
  const supabase = createServerClient();

  try {
    const { data, error } = await runProductsQuery((includeIsActiveFilter) => {
      let query = supabase.from("products").select("*");

      if (includeIsActiveFilter) {
        query = query.eq("is_active", true);
      }

      return query
        .or("status.eq.published,status.is.null")
        .order("created_at", { ascending: false });
    });

    if (error) {
      console.error("Corporate page products fetch error:", error);
      return [];
    }

    return ((data as DBProduct[]) || []).map(transformProduct);
  } catch (error) {
    console.error("Corporate page products fetch crashed:", error);
    return [];
  }
}

function findProduct(products: Product[], searchName: string): Product | null {
  const normalizedSearch = searchName.toLocaleLowerCase("tr-TR").trim();

  return (
    products.find(
      (product) => product.name.toLocaleLowerCase("tr-TR").trim() === normalizedSearch,
    ) ||
    products.find((product) =>
      product.name.toLocaleLowerCase("tr-TR").includes(normalizedSearch),
    ) ||
    products.find((product) =>
      normalizedSearch.includes(product.name.toLocaleLowerCase("tr-TR")),
    ) ||
    null
  );
}

export default async function CorporateProductsPage() {
  const products = await getProducts();
  const showcaseProducts = TARGET_PRODUCTS.map((target) => {
    const product = findProduct(products, target.searchName);
    return product
      ? {
          product,
          displayName: target.displayName,
        }
      : null;
  }).filter((item): item is { product: Product; displayName: string } => item !== null);

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="relative flex h-[60vh] min-h-[420px] max-h-[720px] items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/images/placeholders/1.1.jpg"
            alt="Kurumsal deri ürünler"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/60" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
          <span className="mb-4 inline-block text-xs font-medium uppercase tracking-[0.2em] text-white/80 sm:text-sm">
            ŞİRKETİNİZE ÖZEL ÜRÜNLERLE KALICI İZ BIRAKIN
          </span>
          <h1 className="mb-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            MARKANIZA PRESTİJ KATIN
          </h1>
          <Link
            href="/iletisim"
            className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm font-medium uppercase tracking-wide text-neutral-900 transition-colors hover:bg-neutral-100"
          >
            Teklif al
          </Link>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="container-premium mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-2xl tracking-tight text-neutral-900 sm:text-3xl lg:text-4xl">
            Kişiselleştirilmiş hediyelerle bir adım öne geçin
          </h2>
          <div className="space-y-4 leading-relaxed text-neutral-600">
            <p>
              Kurumsal müşterilerimizin ihtiyaçlarını anlıyor ve onlara özel tasarım,
              kalite ve hizmet sunuyoruz.
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
      </section>

      <section className="border-y border-neutral-200 bg-white py-16 lg:py-20">
        <div className="container-premium">
          <div className="mb-10 text-center">
            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Keşfedin
            </span>
            <h2 className="text-2xl tracking-tight text-neutral-900 sm:text-3xl">
              Kurumsal ürünlerimiz
            </h2>
          </div>

          {showcaseProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-8">
              {showcaseProducts.map(({ product, displayName }) => {
                const primaryImage = resolveStorefrontAssetUrl(product.images[0]);
                const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);

                return (
                  <Link key={product.id} href={`/urunler/${product.slug}`} className="group block">
                    <div className="relative mb-3 aspect-square overflow-hidden bg-neutral-100">
                      {primaryImage ? (
                        <Image
                          src={primaryImage}
                          alt={displayName}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          unoptimized={usesProxiedPrimaryImage}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 text-sm text-neutral-400">
                          Görsel yok
                        </div>
                      )}
                    </div>
                    <h3 className="line-clamp-2 text-sm font-medium leading-snug text-neutral-900 transition-colors group-hover:text-neutral-600">
                      {displayName}
                    </h3>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-neutral-500">
              Ürünler şu anda yüklenemedi. Lütfen daha sonra tekrar deneyin.
            </div>
          )}
        </div>
      </section>

      <CorporateProductsClient />
    </div>
  );
}
