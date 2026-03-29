// Ürün Kategorileri
export type ProductCategory =
  | "fistik-ezmesi"
  | "findik-ezmesi"
  | "kuruyemis";

// Ürün Alt Kategorileri
export type ProductSubcategory =
  | "sekersiz"
  | "hurmalı"
  | "balli"
  | "klasik"
  | "sutlu-findik-kremasi"
  | "kakaolu"
  | "cig"
  | "kavrulmus";

// Ürün Durumu
export type ProductStatus = "draft" | "published" | "archived" | "scheduled";

// Besin Değeri Bazı
export type NutritionBasis = "per_100g" | "per_serving";

// KDV Oranları
export type TaxRate = 0 | 1 | 8 | 10 | 20;

// Alerjenler
export type Allergen = 
  | "fistik" 
  | "sut" 
  | "yumurta" 
  | "gluten" 
  | "yerfistigi" 
  | "badem" 
  | "kaju" 
  | "ceviz";

// Görsel Yapısı (Alt text + sıralama)
export interface ProductImage {
  url: string;
  alt: string;
  isPrimary: boolean;
  sortOrder: number;
}

// Besin Değerleri
export interface NutritionalInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number;
}

// Vitamin/Mineral
export interface Vitamins {
  a?: string; // "%15" formatında
  c?: string;
  d?: string;
  e?: string;
  calcium?: string;
  iron?: string;
  magnesium?: string;
  zinc?: string;
}

// Ürün Boyutları
export interface ProductDimensions {
  width?: number; // cm
  height?: number;
  depth?: number;
  weight?: number; // gram
}

// İndirim Kuralı
export interface DiscountRule {
  id: string;
  name: string;
  type: "buy_x_get_y" | "bulk" | "percentage" | "fixed";
  config: {
    buy?: number;
    get?: number;
    minQty?: number;
    discountPercent?: number;
    discountAmount?: number;
  };
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
}

// Ürün Varyasyonu - Genişletilmiş
export interface ProductVariant {
  id: string;
  name: string;
  weight: number | string; // Veritabanında string, frontend'de number olabilir
  price: number;
  originalPrice?: number;
  cost?: number; // Maliyet
  stock: number;
  sku: string;
  barcode?: string;
  groupName?: string; // "Gramaj", "Renk"
  images?: string[];
  unit?: "adet" | "kg" | "g" | "lt" | "ml" | "paket" | "kutu";
  maxPurchaseQuantity?: number;
  warehouseLocation?: string;
}

// SEO Verileri
export interface ProductSEO {
  title: string;
  description: string;
  keywords: string[];
  focusKeyword?: string;
  ogImage?: string;
  canonicalUrl?: string;
  robots: "index,follow" | "noindex,follow" | "index,nofollow" | "noindex,nofollow";
}

// Stok Yönetimi
export interface StockSettings {
  trackStock: boolean;
  lowStockThreshold: number;
}

// Besin Değerleri Ayarları
export interface NutritionSettings {
  basis: NutritionBasis;
  servingSize: number;
  servingPerContainer: number;
  allergens: Allergen[];
  vitamins: Vitamins;
  ingredients?: string;
  storageConditions?: string;
  shelfLifeDays?: number;
}

// Ürün - Genişletilmiş
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: ProductCategory;
  subcategory: ProductSubcategory;
  variants: ProductVariant[];
  images: string[];
  imagesV2?: ProductImage[];
  tags: string[];
  nutritionalInfo?: NutritionalInfo;
  vegan: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  highProtein: boolean;
  rating: number;
  reviewCount: number;
  featured?: boolean;
  new?: boolean;
  isActive?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  discount?: number;
  
  // Yeni Alanlar
  status?: ProductStatus;
  isDraft?: boolean;
  publishedAt?: string;
  taxRate?: TaxRate;
  brand?: string;
  countryOfOrigin?: string;
  gtin?: string;
  sku?: string;
  dimensions?: ProductDimensions;
  relatedProducts?: string[];
  complementaryProducts?: string[];
  discountRules?: DiscountRule[];
  seo?: ProductSEO;
  stockSettings?: StockSettings;
  nutritionSettings?: NutritionSettings;
  sales_count?: number;
  isBestseller?: boolean;
}

// Kategori Bilgisi
export interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  icon: string;
  productCount: number;
  parent_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
  seo_title?: string;
  seo_description?: string;
  children?: CategoryInfo[];
}

// Ürün Filtreleri
export interface ProductFilters {
  category?: ProductCategory;
  subcategory?: ProductSubcategory;
  priceRange?: [number, number];
  vegan?: boolean;
  glutenFree?: boolean;
  sugarFree?: boolean;
  highProtein?: boolean;
  search?: string;
  status?: ProductStatus;
}

// Ürün Sıralama
export type ProductSortOption =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "popular";

// Wizard Form State
export interface ProductWizardState {
  // Adım 1: Temel Bilgiler
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: ProductCategory | "";
  subcategory: ProductSubcategory | "";
  tags: string[];
  brand: string;
  countryOfOrigin: string;
  
  // Adım 2: Görseller
  images: ProductImage[];
  
  // Adım 3: Fiyatlandırma
  variants: ProductVariant[];
  taxRate: TaxRate;
  discountRules: DiscountRule[];
  
  // Adım 4: Stok
  trackStock: boolean;
  lowStockThreshold: number;
  
  // Adım 5: SEO
  seo: ProductSEO;
  
  // Adım 6: Besin Değerleri
  nutritionalInfo: NutritionalInfo;
  nutritionSettings: NutritionSettings;
  vegan: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  highProtein: boolean;
  
  // Adım 7: Yayın
  status: ProductStatus;
  publishedAt?: string;
}

// Wizard Adımları
export interface WizardStep {
  id: number;
  title: string;
  description: string;
  icon: string;
  isRequired: boolean;
}

export const WIZARD_STEPS: WizardStep[] = [
  { id: 1, title: "Temel Bilgiler", description: "Ürün adı, kategori, açıklama", icon: "FileText", isRequired: true },
  { id: 2, title: "Görseller", description: "Fotoğraflar ve SEO optimizasyonu", icon: "Image", isRequired: true },
  { id: 3, title: "Fiyatlandırma", description: "Varyantlar ve indirimler", icon: "Tag", isRequired: true },
  { id: 4, title: "Stok Yönetimi", description: "Stok takip ayarları", icon: "Package", isRequired: false },
  { id: 5, title: "SEO & Meta", description: "Arama motoru optimizasyonu", icon: "Search", isRequired: true },
  { id: 6, title: "Besin Değerleri", description: "Ürün içerik bilgileri", icon: "Apple", isRequired: false },
  { id: 7, title: "Önizle & Yayınla", description: "Son kontrol ve yayınlama", icon: "CheckCircle", isRequired: true },
];
