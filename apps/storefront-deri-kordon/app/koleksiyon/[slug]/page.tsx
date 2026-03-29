import { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { ProductCard } from "@/components/product/ProductCard";
import Link from "next/link";
import type { Category, CategoryFAQ } from "@/types/category";
import type { Product, ProductCategory, ProductVariant } from "@/types/product";
import { notFound } from "next/navigation";

// ============================================================================
// CONFIGURATION
// ============================================================================

export const revalidate = 300; // 5 dakika ISR

// ============================================================================
// TYPES - Database Response Types
// ============================================================================

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
  variants: DBVariant[];
}

interface DBVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  weight: string | null;
}

// Valid category slugs mapped to ProductCategory type
const VALID_CATEGORIES: Record<string, ProductCategory> = {
  "fistik-ezmesi": "fistik-ezmesi",
  "findik-ezmesi": "findik-ezmesi",
  "badem-ezmesi": "fistik-ezmesi", // Map to closest category
  "antep-fistigi-ezmesi": "fistik-ezmesi",
  "karma-ezmeler": "fistik-ezmesi",
  "kuruyemis": "kuruyemis",
  "kuruyemisler": "kuruyemis",
};

// ============================================================================
// DATA FETCHING
// ============================================================================

async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const supabase = createServerClient();
  
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();
    
    if (error || !data) {
      console.error("Category fetch error:", error);
      return null;
    }
    
    return data as Category;
  } catch (error) {
    console.error("Unexpected error fetching category:", error);
    return null;
  }
}

async function getProductsByCategory(categorySlug: string): Promise<Product[]> {
  const supabase = createServerClient();
  
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select(`
        *,
        variants:product_variants(*)
      `)
      .eq("category", categorySlug)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    
    if (error || !products) {
      console.error("Products fetch error:", error);
      return [];
    }
    
    const transformedProducts = (products as DBProduct[])
      .map(p => transformProduct(p))
      .filter((p): p is Product => p !== null);
    
    return transformedProducts.filter(p => p.variants && p.variants.length > 0);
  } catch (error) {
    console.error("Unexpected error fetching products:", error);
    return [];
  }
}

function transformProduct(dbProduct: DBProduct): Product | null {
  // Map category slug to ProductCategory type
  const category = VALID_CATEGORIES[dbProduct.category];
  if (!category) {
    console.warn(`Unknown category: ${dbProduct.category}`);
    return null;
  }

  // Transform variants
  const variants: ProductVariant[] = dbProduct.variants?.map(v => ({
    id: v.id,
    name: v.name,
    weight: v.weight ? parseInt(v.weight, 10) : 250,
    price: Number(v.price),
    originalPrice: v.original_price ? Number(v.original_price) : undefined,
    stock: v.stock,
    sku: v.sku || "",
    barcode: undefined,
    unit: "g",
  })) || [];

  return {
    id: dbProduct.id,
    name: dbProduct.name,
    slug: dbProduct.slug,
    description: dbProduct.description || "",
    shortDescription: dbProduct.short_description || "",
    category: category,
    subcategory: (dbProduct.subcategory as Product["subcategory"]) || "klasik",
    images: dbProduct.images || [],
    tags: dbProduct.tags || [],
    variants: variants,
    vegan: dbProduct.vegan,
    glutenFree: dbProduct.gluten_free,
    sugarFree: dbProduct.sugar_free,
    highProtein: dbProduct.high_protein,
    rating: Number(dbProduct.rating) || 5,
    reviewCount: dbProduct.review_count || 0,
    featured: dbProduct.is_featured,
    new: dbProduct.is_new,
    isActive: dbProduct.is_active,
    seoTitle: dbProduct.seo_title || undefined,
    seoDescription: dbProduct.seo_description || undefined,
    isBestseller: dbProduct.is_bestseller,
  };
}

// ============================================================================
// METADATA GENERATION
// ============================================================================

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  
  if (!category) {
    return {
      title: "Koleksiyon BulunamadÄ± | Deri Kordon",
      robots: { index: false, follow: false }
    };
  }
  
  // Use SEO fields from DB, fallback to defaults
  const title = category.seo_title || `${category.name} | Deri Kordon`;
  const description = category.seo_description || category.description || `${category.name} kategorisindeki Ã¼rÃ¼nlerimizi keÅŸfedin.`;
  const canonicalUrl = `https://deri-kordon.test/koleksiyon/${category.slug}`;
  const imageUrl = category.image || "/og-image.jpg";
  
  return {
    title,
    description,
    keywords: category.seo_keywords?.join(", ") || undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
      locale: "tr_TR",
      siteName: "Deri Kordon",
      images: [{
        url: imageUrl,
        width: 1200,
        height: 630,
        alt: category.name
      }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl]
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      }
    }
  };
}

// ============================================================================
// SCHEMA GENERATORS
// ============================================================================

function generateBreadcrumbSchema(category: Category): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Ana Sayfa",
        "item": "https://deri-kordon.test"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "ÃœrÃ¼nler",
        "item": "https://deri-kordon.test/urunler"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": category.name,
        "item": `https://deri-kordon.test/koleksiyon/${category.slug}`
      }
    ]
  };
}

function generateCollectionPageSchema(category: Category, products: Product[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": category.seo_title || category.name,
    "description": category.seo_description || category.description,
    "url": `https://deri-kordon.test/koleksiyon/${category.slug}`,
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": products.map((product, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "url": `https://deri-kordon.test/urun/${product.slug}`
      }))
    }
  };
}

function generateFAQSchema(faq: CategoryFAQ[] | null): object | null {
  if (!faq || faq.length === 0) return null;
  
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map(item => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer
      }
    }))
  };
}

function generateOrganizationSchema(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Deri Kordon",
    "url": "https://deri-kordon.test",
    "logo": "https://deri-kordon.test/logo.png",
    "sameAs": [
      "https://www.instagram.com/ornek-magaza",
      "https://www.facebook.com/ornek-magaza"
    ]
  };
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function CollectionPage({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}) {
  const { slug } = await params;
  
  // Parallel data fetching
  const [category, products] = await Promise.all([
    getCategoryBySlug(slug),
    getProductsByCategory(slug)
  ]);
  
  if (!category) {
    notFound();
  }

  const categoryName = category.name;
  const categoryDescription = category.description;
  const faq = category.faq;
  const geoData = category.geo_data;

  // Generate schemas
  const breadcrumbSchema = generateBreadcrumbSchema(category);
  const collectionSchema = generateCollectionPageSchema(category, products);
  const faqSchema = generateFAQSchema(faq);
  const orgSchema = generateOrganizationSchema();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      {/* Breadcrumb Navigation */}
      <nav className="bg-white border-b border-gray-200" aria-label="Breadcrumb">
        <div className="container mx-auto px-4 py-3">
          <ol className="flex items-center gap-2 text-sm text-gray-500">
            <li>
              <Link href="/" className="hover:text-primary transition-colors">
                Ana Sayfa
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/urunler" className="hover:text-primary transition-colors">
                ÃœrÃ¼nler
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-gray-900 font-medium" aria-current="page">
              {categoryName}
            </li>
          </ol>
        </div>
      </nav>

      {/* Category Header */}
      <header className="bg-white">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            {categoryName}
          </h1>
          {categoryDescription && (
            <p className="text-gray-600 max-w-2xl text-lg">
              {categoryDescription}
            </p>
          )}
          <p className="text-gray-500 mt-2">
            {products.length} Ã¼rÃ¼n
          </p>
        </div>
      </header>

      {/* Products Grid */}
      <main className="container mx-auto px-4 py-8">
        {products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">Bu kategoride henÃ¼z Ã¼rÃ¼n bulunmuyor.</p>
            <Link 
              href="/urunler" 
              className="inline-block mt-4 px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              TÃ¼m ÃœrÃ¼nleri GÃ¶r
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map((product, index) => (
              <ProductCard 
                key={product.id} 
                product={product} 
                index={index}
              />
            ))}
          </div>
        )}
      </main>

      {/* FAQ Section (if exists) */}
      {faq && faq.length > 0 && (
        <section className="bg-white border-t border-gray-200 mt-12">
          <div className="container mx-auto px-4 py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              SÄ±kÃ§a Sorulan Sorular
            </h2>
            <div className="space-y-4 max-w-3xl">
              {faq.map((item, index) => (
                <details 
                  key={index} 
                  className="group bg-gray-50 rounded-lg p-4 cursor-pointer"
                >
                  <summary className="font-medium text-gray-900 flex items-center justify-between">
                    {item.question}
                    <span className="text-gray-400 group-open:rotate-180 transition-transform">
                      â–¼
                    </span>
                  </summary>
                  <p className="mt-3 text-gray-600 leading-relaxed">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* GEO Key Takeaways (if exists) - Hidden from users, visible to LLMs */}
      {geoData && geoData.keyTakeaways && geoData.keyTakeaways.length > 0 && (
        <section 
          className="sr-only" 
          aria-hidden="true"
          data-geo-takeaways={JSON.stringify(geoData.keyTakeaways)}
        >
          <h2>Ã–nemli Ã‡Ä±karÄ±mlar</h2>
          <ul>
            {geoData.keyTakeaways.map((takeaway, index) => (
              <li key={index}>{takeaway}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

