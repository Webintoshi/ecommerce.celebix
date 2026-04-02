import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { runProductsQuery } from "@/lib/products-query-compat";
import { Product } from "@/types/product";
import { CorporateProductsClient } from "./CorporateProductsClient";

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
  images: string[];
  category: string;
  subcategory: string | null;
  tags: string[];
  is_featured: boolean;
  is_bestseller: boolean;
  is_active: boolean;
  is_new: boolean;
  vegan: boolean;
  gluten_free: boolean;
  sugar_free: boolean;
  high_protein: boolean;
  rating: number;
  review_count: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

function transformProduct(dbProduct: DBProduct): Product {
  return {
    id: dbProduct.id,
    name: dbProduct.name,
    slug: dbProduct.slug,
    description: dbProduct.description || "",
    shortDescription: dbProduct.short_description || "",
    category: (dbProduct.category as Product["category"]) || "fistik-ezmesi",
    subcategory: (dbProduct.subcategory as Product["subcategory"]) || "klasik",
    images: dbProduct.images || [],
    tags: dbProduct.tags || [],
    variants: [],
    vegan: dbProduct.vegan,
    glutenFree: dbProduct.gluten_free,
    sugarFree: dbProduct.sugar_free,
    highProtein: dbProduct.high_protein,
    rating: Number(dbProduct.rating) || 5,
    reviewCount: dbProduct.review_count || 0,
    featured: dbProduct.is_featured,
    new: dbProduct.is_new,
    seoTitle: dbProduct.seo_title || undefined,
    seoDescription: dbProduct.seo_description || undefined,
  };
}

async function getProducts(): Promise<Product[]> {
  const supabase = createServerClient();

  try {
    const { data: products, error } = await runProductsQuery(
      (includeIsActiveFilter) => {
        let query = supabase.from("products").select(`
            *
          `);

        if (includeIsActiveFilter) {
          query = query.eq("is_active", true);
        }

        return query
          .or("status.eq.published,status.is.null")
          .order("created_at", { ascending: false });
      }
    );

    if (error) {
      console.error("Supabase error:", error);
      return [];
    }

    return ((products as DBProduct[]) || []).map(transformProduct);
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return [];
  }
}

// Map display names to product names in database
const TARGET_PRODUCTS = [
  { displayName: "Çıtçıtlı Deri Kalemlik", searchName: "Çıtçıtlı Deri Kalemlik" },
  { displayName: "Deri Airpods Kılıfı", searchName: "Deri Airpods Kılıfı" },
  { displayName: "Deri Airtag Kılıfı", searchName: "Deri Airtag Kılıfı" },
  { displayName: "Deri Bardak Altlığı", searchName: "Deri Bardak Altlığı" },
];

function findProduct(products: Product[], searchName: string): Product | null {
  // Try exact match first
  let match = products.find(
    (p) => p.name.toLowerCase().trim() === searchName.toLowerCase().trim()
  );
  
  // Try includes match
  if (!match) {
    match = products.find(
      (p) => p.name.toLowerCase().includes(searchName.toLowerCase())
    );
  }
  
  // Try reverse includes
  if (!match) {
    match = products.find(
      (p) => searchName.toLowerCase().includes(p.name.toLowerCase())
    );
  }
  
  return match || null;
}

export default async function CorporateProductsPage() {
  let products: Product[] = [];
  let showcaseProducts: { product: Product; displayName: string }[] = [];

  try {
    products = await getProducts();
    
    // Find the 4 target products
    showcaseProducts = TARGET_PRODUCTS.map((target) => {
      const product = findProduct(products, target.searchName);
      return {
        product: product!,
        displayName: target.displayName,
      };
    }).filter((item): item is { product: Product; displayName: string } => 
      item.product !== null
    );
  } catch (error) {
    console.error("Failed to fetch products:", error);
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      {/* Hero */}
      <section className="relative h-[60vh] min-h-[420px] max-h-[720px] flex items-center justify-center overflow-hidden">
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

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <span className="inline-block text-white/80 text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            ŞİRKETİNİZE ÖZEL ÜRÜNLERLE KALICI İZ BIRAKIN
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white tracking-tight mb-6">
            MARKANIZA PRESTİJ KATIN
          </h1>
          <Link
            href="/iletisim"
            className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-neutral-900 text-sm font-medium uppercase tracking-wide rounded-full hover:bg-neutral-100 transition-colors"
          >
            TEKLİF AL
          </Link>
        </div>
      </section>

      {/* Intro */}
      <section className="py-16 lg:py-20">
        <div className="container-premium max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl text-neutral-900 tracking-tight mb-6">
            KİŞİSELLEŞTİRİLMİŞ HEDİYELERLE BİR ADIM ÖNE GEÇİN…
          </h2>
          <div className="space-y-4 text-neutral-600 leading-relaxed">
            <p>
              Kurumsal müşterilerimizin ihtiyaçlarını anlıyor ve onlara özel tasarım, kalite ve hizmet sunuyoruz.
            </p>
            <p>
              Deri ürünlerimiz, şirketinizin imajını yansıtacak şekilde özenle tasarlanır.
            </p>
            <p>
              Toplu siparişlerde özel tasarımlarla her detayı düşünerek sizin için en iyi çözümleri üretiyoruz.
            </p>
          </div>
        </div>
      </section>

      {/* Showcase Products - Dynamic */}
      <section className="py-16 lg:py-20 bg-white border-y border-neutral-200">
        <div className="container-premium">
          <div className="text-center mb-10">
            <span className="text-neutral-500 text-xs font-medium tracking-[0.2em] uppercase block mb-2">
              Keşfedin
            </span>
            <h2 className="text-2xl sm:text-3xl text-neutral-900 tracking-tight">
              Kurumsal Ürünlerimiz
            </h2>
          </div>

          {showcaseProducts.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              {showcaseProducts.map(({ product, displayName }) => {
                const primaryImage = 
                  product.images?.[0] || 
                  (product as any).images_v2?.[0]?.url || 
                  (product as any).images_v2?.[0];
                
                return (
                  <Link 
                    key={product.id} 
                    href={`/urunler/${product.slug}`}
                    className="group block"
                  >
                    <div className="relative aspect-square mb-3 overflow-hidden bg-neutral-100">
                      {primaryImage ? (
                        <Image
                          src={primaryImage}
                          alt={displayName}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm bg-neutral-100">
                          Görsel yok
                        </div>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-neutral-900 group-hover:text-neutral-600 transition-colors line-clamp-2 leading-snug">
                      {displayName}
                    </h3>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500">
              Ürünler yüklenemedi. Lütfen daha sonra tekrar deneyin.
            </div>
          )}
        </div>
      </section>

      {/* Client Component for Interactive Sections */}
      <CorporateProductsClient />
    </div>
  );
}
