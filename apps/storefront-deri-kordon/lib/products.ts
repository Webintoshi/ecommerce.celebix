import { Product } from "@/types/product";
import { getStoredProducts, addStoredProduct, addStoredProducts, deleteStoredProduct, updateStoredProduct, initializeProducts } from "./product-storage";
import { parseShopifyCSV, importProductsFromCSV } from "./csv-import";

export type { Product } from "@/types/product";

// Default Ürün Verileri
const DEFAULT_PRODUCTS: Product[] = [
  // Fıstık Ezmeleri
  {
    id: "e5473489-7607-42f0-b749-0747379d21c1", // UUID for fistik-sekersiz
    name: "Şekersiz Fıstık Ezmesi",
    slug: "sekersiz-fistik-ezmesi",
    description:
      "Akdeniz ve Ege bölgelerinden en kaliteli yer fıstıklarından üretilen, katkısız ve şekersiz fıstık ezmesi. Kadın ve erkekleri güçlendirir. Daha uzun süre tokluk hissi sağlar. Gün içinde veya sporda bol enerji verir. Kalbinizin sağlıklı kalmasına yardımcı olur. Bağışıklık sistemini güçlendirir ve dengede tutar.",
    shortDescription:
      "Akdeniz ve Ege bölgelerinden en kaliteli yer fıstıklarından üretilen şekersiz fıstık ezmesi.",
    category: "fistik-ezmesi",
    subcategory: "sekersiz",
    images: [
      "/images/products/sekersiz-fistik-1.jpg",
      "/images/products/sekersiz-fistik-2.jpg",
    ],
    tags: ["doğal", "sekersiz", "vegan", "glutensiz", "sporcu"],
    variants: [
      {
        id: "d1e2f3a4-b5c6-7890-1234-567890abcdef", // UUID for fistik-sekersiz-1pack
        name: "1 Adet - 450g",
        weight: 450,
        price: 321,
        stock: 50,
        sku: "EZM-FS-450-1",
      },
      {
        id: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // UUID for fistik-sekersiz-2pack
        name: "2 Adet - 900g",
        weight: 900,
        price: 481.50,
        originalPrice: 642,
        stock: 48,
        sku: "EZM-FS-450-2",
      },
      {
        id: "b2c3d4e5-f6a7-8901-2345-678901bcdef0", // UUID for fistik-sekersiz-3pack
        name: "3 Adet - 1350g",
        weight: 1350,
        price: 597.04,
        originalPrice: 963,
        stock: 45,
        sku: "EZM-FS-450-3",
      },
    ],
    nutritionalInfo: {
      calories: 580,
      protein: 25,
      carbs: 16,
      fat: 46,
      fiber: 8,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: true,
    highProtein: true,
    rating: 5,
    reviewCount: 2,
    featured: true,
    new: false,
  },
  {
    id: "c3d4e5f6-a7b8-9012-3456-789012cdef01", // UUID for fistik-hurmali
    name: "Hurmalı Fıstık Ezmesi",
    slug: "hurmali-fistik-ezmesi",
    description:
      "Fıstık ezmesi ile doğal hurmunun birleşimi. Rafine şeker yerine hurma kullanılarak tatlandırılmış sağlıklı bir alternatif.",
    shortDescription:
      "Fıstık ezmesi ile doğal hurmunun birleşimi, kremalı kıvamda doğal bir lezzet.",
    category: "fistik-ezmesi",
    subcategory: "hurmalı",
    images: [
      "/images/products/hurmali-fistik-1.jpg",
      "/images/products/hurmali-fistik-2.jpg",
    ],
    tags: ["doğal", "hurmalı", "vegan", "glutensiz"],
    variants: [
      {
        id: "d4e5f6a7-b8c9-0123-4567-890123def012", // UUID for fistik-hurmali-1pack
        name: "1 Adet - 450g",
        weight: 450,
        price: 341,
        stock: 45,
        sku: "EZM-FH-450-1",
      },
      {
        id: "e5f6a7b8-c9d0-1234-5678-901234ef0123", // UUID for fistik-hurmali-2pack
        name: "2 Adet - 900g",
        weight: 900,
        price: 511.50,
        originalPrice: 682,
        stock: 42,
        sku: "EZM-FH-450-2",
      },
      {
        id: "f6a7b8c9-d0e1-2345-6789-012345f01234", // UUID for fistik-hurmali-3pack
        name: "3 Adet - 1350g",
        weight: 1350,
        price: 631.85,
        originalPrice: 1023,
        stock: 40,
        sku: "EZM-FH-450-3",
      },
    ],
    nutritionalInfo: {
      calories: 560,
      protein: 23,
      carbs: 32,
      fat: 40,
      fiber: 8,
      sugar: 18,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: false,
    highProtein: true,
    rating: 5,
    reviewCount: 0,
    featured: true,
    new: false,
  },
  {
    id: "a7b8c9d0-e1f2-3456-7890-123456012345", // UUID for fistik-balli
    name: "Ballı Fıstık Ezmesi",
    slug: "balli-fistik-ezmesi",
    description:
      "Yer fıstığı ile doğal arı balının birleşimi. Enerji veren, doyurucu bir doğal besin.",
    shortDescription:
      "Fıstık ezmesine doğal arı balı eklenerek hazırlanmış enerji kaynağı.",
    category: "fistik-ezmesi",
    subcategory: "balli",
    images: [
      "/images/products/balli-fistik-1.jpg",
      "/images/products/balli-fistik-2.jpg",
    ],
    tags: ["doğal", "balli", "vegan", "glutensiz", "enerji"],
    variants: [
      {
        id: "b8c9d0e1-f2a3-4567-8901-234567123456", // UUID for fistik-balli-1pack
        name: "1 Adet - 450g",
        weight: 450,
        price: 341,
        stock: 42,
        sku: "EZM-FB-450-1",
      },
      {
        id: "c9d0e1f2-a3b4-5678-9012-345678234567", // UUID for fistik-balli-2pack
        name: "2 Adet - 900g",
        weight: 900,
        price: 511.50,
        originalPrice: 682,
        stock: 40,
        sku: "EZM-FB-450-2",
      },
      {
        id: "d0e1f2a3-b4c5-6789-0123-456789345678", // UUID for fistik-balli-3pack
        name: "3 Adet - 1350g",
        weight: 1350,
        price: 631.85,
        originalPrice: 1023,
        stock: 38,
        sku: "EZM-FB-450-3",
      },
    ],
    nutritionalInfo: {
      calories: 540,
      protein: 23,
      carbs: 28,
      fat: 40,
      fiber: 7,
      sugar: 14,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: false,
    highProtein: true,
    rating: 5,
    reviewCount: 0,
    featured: true,
    new: false,
  },
  {
    id: "e1f2a3b4-c5d6-7890-1234-567890456789", // UUID for fistik-klasik
    name: "Klasik Fıstık Ezmesi",
    slug: "klasik-fistik-ezmesi",
    description:
      "Klasik Amerikan tarzı fıstık ezmesi. Tuzsuz, şeker ilavesiz, sadece yer fıstığı.",
    shortDescription: "Klasik usul fıstık ezmesi. Tuzsuz ve şekersiz.",
    category: "fistik-ezmesi",
    subcategory: "klasik",
    images: [
      "/images/products/klasik-fistik-1.jpg",
      "/images/products/klasik-fistik-2.jpg",
    ],
    tags: ["klasik", "amerikan", "kahvalti"],
    variants: [
      {
        id: "f2a3b4c5-d6e7-8901-2345-678901567890", // UUID for fistik-klasik-1pack
        name: "1 Adet - 450g",
        weight: 450,
        price: 331,
        stock: 50,
        sku: "EZM-FK-450-1",
      },
      {
        id: "a3b4c5d6-e7f8-9012-3456-789012678901", // UUID for fistik-klasik-2pack
        name: "2 Adet - 900g",
        weight: 900,
        price: 496.50,
        originalPrice: 662,
        stock: 48,
        sku: "EZM-FK-450-2",
      },
      {
        id: "b4c5d6e7-f8a9-0123-4567-890123789012", // UUID for fistik-klasik-3pack
        name: "3 Adet - 1350g",
        weight: 1350,
        price: 613.85,
        originalPrice: 993,
        stock: 45,
        sku: "EZM-FK-450-3",
      },
    ],
    nutritionalInfo: {
      calories: 590,
      protein: 24,
      carbs: 16,
      fat: 48,
      fiber: 8,
      sugar: 4,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: true,
    highProtein: true,
    rating: 5,
    reviewCount: 0,
    featured: true,
    new: false,
  },

  // Fındık Ezmeleri
  {
    id: "c5d6e7f8-a9b0-1234-5678-901234890123", // UUID for sutlu-findik-kremasi
    name: "Sütlü Fındık Kreması",
    slug: "sutlu-findik-kremasi",
    description:
      "Fındık kremanın yumuşacık tadı. Kahvaltıların vazgeçilmezi, çocukların favorisi.",
    shortDescription:
      "Fındık kremasına süt eklenerek hazırlanmış, yumuşak kıvamlı bir lezzet.",
    category: "findik-ezmesi",
    subcategory: "sutlu-findik-kremasi",
    images: [
      "/images/products/sutlu-findik-1.jpg",
      "/images/products/sutlu-findik-2.jpg",
    ],
    tags: ["sutlu", "kahvalti", "cocuklar"],
    variants: [
      {
        id: "d6e7f8a9-b0c1-2345-6789-012345901234", // UUID for sutlu-findik-1pack
        name: "1 Adet - 450g",
        weight: 450,
        price: 241,
        stock: 42,
        sku: "EZM-SFK-450-1",
      },
      {
        id: "e7f8a9b0-c1d2-3456-7890-123456012345", // UUID for sutlu-findik-2pack
        name: "2 Adet - 900g",
        weight: 900,
        price: 361.50,
        originalPrice: 482,
        stock: 40,
        sku: "EZM-SFK-450-2",
      },
      {
        id: "f8a9b0c1-d2e3-4567-8901-234567123456", // UUID for sutlu-findik-3pack
        name: "3 Adet - 1350g",
        weight: 1350,
        price: 446.85,
        originalPrice: 723,
        stock: 38,
        sku: "EZM-SFK-450-3",
      },
    ],
    nutritionalInfo: {
      calories: 480,
      protein: 10,
      carbs: 42,
      fat: 32,
      fiber: 5,
      sugar: 22,
    },
    vegan: false,
    glutenFree: true,
    sugarFree: false,
    highProtein: false,
    rating: 5,
    reviewCount: 0,
    featured: true,
    new: false,
  },
  {
    id: "a9b0c1d2-e3f4-5678-9012-345678234567", // UUID for kakaolu-findik
    name: "Kakaolu Fındık Ezmesi",
    slug: "kakaolu-findik-ezmesi",
    description:
      "Fındık ezmesi ile doğal kakaonun mükemmel uyumu. Çikolata severler için sağlıklı bir alternatif.",
    shortDescription:
      "Fındık ezmesine doğal kakao eklenerek hazırlanmış, çikolata tadında bir lezzet.",
    category: "findik-ezmesi",
    subcategory: "kakaolu",
    images: [
      "/images/products/kakaolu-findik-1.jpg",
      "/images/products/kakaolu-findik-2.jpg",
    ],
    tags: ["doğal", "kakaolu", "vegan", "glutensiz", "cikolata"],
    variants: [
      {
        id: "b0c1d2e3-f4a5-6789-0123-456789345678", // UUID for kakaolu-findik-1pack
        name: "1 Adet - 450g",
        weight: 450,
        price: 371,
        stock: 38,
        sku: "EZM-KF-450-1",
      },
      {
        id: "c1d2e3f4-a5b6-7890-1234-567890456789", // UUID for kakaolu-findik-2pack
        name: "2 Adet - 900g",
        weight: 900,
        price: 556.50,
        originalPrice: 742,
        stock: 36,
        sku: "EZM-KF-450-2",
      },
      {
        id: "d2e3f4a5-b6c7-8901-2345-678901567890", // UUID for kakaolu-findik-3pack
        name: "3 Adet - 1350g",
        weight: 1350,
        price: 687.35,
        originalPrice: 1113,
        stock: 34,
        sku: "EZM-KF-450-3",
      },
    ],
    nutritionalInfo: {
      calories: 550,
      protein: 12,
      carbs: 35,
      fat: 42,
      fiber: 10,
      sugar: 12,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: false,
    highProtein: false,
    rating: 5,
    reviewCount: 0,
    featured: true,
    new: false,
  },

  // Kuruyemişler
  {
    id: "e3f4a5b6-c7d8-9012-3456-789012678901", // UUID for yer-fistigi
    name: "Yer Fıstığı",
    slug: "yer-fistigi",
    description:
      "Kavrulmuş kabuksuz yer fıstığı. Doypack paketli, taze ve lezzetli.",
    shortDescription: "Kavrulmuş kabuksuz yer fıstığı.",
    category: "kuruyemis",
    subcategory: "kavrulmus",
    images: [
      "/images/products/yer-fistigi-1.jpg",
      "/images/products/yer-fistigi-2.jpg",
    ],
    tags: ["kuruyemis", "kavrulmus", "kabuksuz"],
    variants: [
      {
        id: "f4a5b6c7-d8e9-0123-4567-890123789012", // UUID for yer-fistigi-500
        name: "500g",
        weight: 500,
        price: 249,
        stock: 55,
        sku: "EZM-YF-500",
      },
    ],
    nutritionalInfo: {
      calories: 567,
      protein: 26,
      carbs: 16,
      fat: 49,
      fiber: 9,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: true,
    highProtein: true,
    rating: 5,
    reviewCount: 0,
    featured: false,
    new: false,
  },
  {
    id: "a5b6c7d8-e9f0-1234-5678-901234890123", // UUID for cig-badem
    name: "Çiğ Badem",
    slug: "cig-badem",
    description:
      "Doğal çiğ badem. Kabuksuz, taze ve besleyici.",
    shortDescription: "Doğal çiğ badem.",
    category: "kuruyemis",
    subcategory: "cig",
    images: [
      "/images/products/cig-badem-1.jpg",
      "/images/products/cig-badem-2.jpg",
    ],
    tags: ["kuruyemis", "cig", "kabuksuz", "badem"],
    variants: [
      {
        id: "b6c7d8e9-f0a1-2345-6789-012345901234", // UUID for cig-badem-500
        name: "500g",
        weight: 500,
        price: 321,
        stock: 45,
        sku: "EZM-CB-500",
      },
    ],
    nutritionalInfo: {
      calories: 579,
      protein: 21,
      carbs: 22,
      fat: 50,
      fiber: 12,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: true,
    highProtein: true,
    rating: 5,
    reviewCount: 0,
    featured: false,
    new: false,
  },
  {
    id: "c7d8e9f0-a1b2-3456-7890-123456012345", // UUID for cig-findik-ic
    name: "Çiğ Fındık İçi",
    slug: "cig-findik-ic",
    description:
      "Doğal çiğ fındık içi. Kabuksuz, taze ve besleyici.",
    shortDescription: "Doğal çiğ fındık içi.",
    category: "kuruyemis",
    subcategory: "cig",
    images: [
      "/images/products/cig-findik-1.jpg",
      "/images/products/cig-findik-2.jpg",
    ],
    tags: ["kuruyemis", "cig", "kabuksuz", "findik"],
    variants: [
      {
        id: "d8e9f0a1-b2c3-4567-8901-234567123456", // UUID for cig-findik-500
        name: "500g",
        weight: 500,
        price: 371,
        stock: 40,
        sku: "EZM-CFI-500",
      },
    ],
    nutritionalInfo: {
      calories: 628,
      protein: 15,
      carbs: 17,
      fat: 61,
      fiber: 10,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: true,
    highProtein: false,
    rating: 5,
    reviewCount: 0,
    featured: false,
    new: false,
  },
  {
    id: "e9f0a1b2-c3d4-5678-9012-345678234567", // UUID for cig-ceviz-ic
    name: "Çiğ Ceviz İçi",
    slug: "cig-ceviz-ic",
    description:
      "Doğal çiğ ceviz içi. Kabuksuz, taze ve Omega-3 kaynağı.",
    shortDescription: "Doğal çiğ ceviz içi. Omega-3 zengini.",
    category: "kuruyemis",
    subcategory: "cig",
    images: [
      "/images/products/cig-ceviz-1.jpg",
      "/images/products/cig-ceviz-2.jpg",
    ],
    tags: ["kuruyemis", "cig", "kabuksuz", "ceviz", "omega3"],
    variants: [
      {
        id: "f0a1b2c3-d4e5-6789-0123-456789345678", // UUID for cig-ceviz-500
        name: "500g",
        weight: 500,
        price: 411,
        stock: 38,
        sku: "EZM-CCI-500",
      },
    ],
    nutritionalInfo: {
      calories: 654,
      protein: 15,
      carbs: 14,
      fat: 65,
      fiber: 7,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: true,
    highProtein: false,
    rating: 5,
    reviewCount: 0,
    featured: false,
    new: false,
  },
  {
    id: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // UUID for kavrulmus-findik
    name: "Kavrulmuş Fındık",
    slug: "kavrulmus-findik",
    description:
      "Kavrulmuş kabuksuz fındık. Çıtır, taze ve lezzetli.",
    shortDescription: "Kavrulmuş kabuksuz fındık.",
    category: "kuruyemis",
    subcategory: "kavrulmus",
    images: [
      "/images/products/kavrulmus-findik-1.jpg",
      "/images/products/kavrulmus-findik-2.jpg",
    ],
    tags: ["kuruyemis", "kavrulmus", "kabuksuz", "findik"],
    variants: [
      {
        id: "b2c3d4e5-f6a7-8901-2345-678901bcabc1", // UUID for kavrulmus-findik-500 (Unique)
        name: "500g",
        weight: 500,
        price: 671,
        stock: 35,
        sku: "EZM-KF-500",
      },
    ],
    nutritionalInfo: {
      calories: 646,
      protein: 15,
      carbs: 17,
      fat: 64,
      fiber: 10,
    },
    vegan: true,
    glutenFree: true,
    sugarFree: true,
    highProtein: false,
    rating: 5,
    reviewCount: 0,
    featured: false,
    new: false,
  },
];

// Initialize products on load
if (typeof window !== "undefined") {
  initializeProducts(DEFAULT_PRODUCTS);
}

// Get all products - Fetch from Supabase
export async function getAllProducts(): Promise<Product[]> {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, variants:product_variants(*)")
    .eq("is_active", true)
    .eq("status", "published");

  if (error) {
    console.error("Error fetching products from Supabase:", error);
    return [];
  }

  return data || [];
}

// Get limited products for homepage (optimized)
export async function getLimitedProducts(limit: number = 8): Promise<Product[]> {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, variants:product_variants(*)")
    .eq("is_active", true)
    .eq("status", "published")
    .limit(limit);

  if (error) {
    console.error("Error fetching limited products:", error);
    return [];
  }

  return data || [];
}

export const PRODUCTS: Product[] = [];

export async function getProductSlug(): Promise<string[]> {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("slug")
    .eq("is_active", true)
    .eq("status", "published");

  if (error) {
    console.error("Error fetching product slugs from Supabase:", error);
    return [];
  }

  return (data || []).map((p) => p.slug);
}

// Yardımcı Fonksiyonlar - Şimdi Supabase'den çekiyor
export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, variants:product_variants(*)")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("status", "published")
    .single();

  if (error) {
    console.error("Error fetching product by slug from Supabase:", error);
    return undefined;
  }

  return data;
}

export function getProductsByCategory(category: string): Product[] {
  return []; // Sadece Supabase'den çek
}

export function getFeaturedProducts(limit = 8): Product[] {
  return []; // Sadece Supabase'den çek
}

export function getNewProducts(limit = 4): Product[] {
  return []; // Sadece Supabase'den çek
}

export function searchProducts(query: string): Product[] {
  return []; // Sadece Supabase'den çek
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  return []; // Sadece Supabase'den çek
}

export function getProductsByCategorySlug(slug: string): Product[] {
  return []; // Sadece Supabase'den çek
}

export function addProduct(product: Product): void {
  addStoredProduct(product);
}

export function updateProduct(id: string, updatedProduct: Partial<Product>): void {
  updateStoredProduct(id, updatedProduct);
}

export function deleteProduct(id: string): void {
  deleteStoredProduct(id);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const products = await getAllProducts();
  return products.find((p) => p.id === id);
}

export function importProductsFromCSVFile(csvContent: string): {
  success: boolean;
  count: number;
  message: string;
} {
  const result = importProductsFromCSV(csvContent);

  if (result.success && result.products.length > 0) {
    addStoredProducts(result.products);
    return {
      success: true,
      count: result.products.length,
      message: `${result.products.length} ürün başarıyla içe aktarıldı.`,
    };
  }

  return {
    success: false,
    count: 0,
    message: result.message,
  };
}

export { parseShopifyCSV };
