// Product categories remain admin-defined and store-specific.
export type ProductCategory = string;

// Product subcategories remain admin-defined and store-specific.
export type ProductSubcategory = string;

// Product publishing state.
export type ProductStatus = "draft" | "published" | "archived" | "scheduled";

// Nutrition display basis.
export type NutritionBasis = "per_100g" | "per_serving";

// Tax rates used by the storefront.
export type TaxRate = 0 | 1 | 8 | 10 | 20;

// Legacy allergen set kept for compatibility with current data shapes.
export type Allergen =
  | "fistik"
  | "sut"
  | "yumurta"
  | "gluten"
  | "yerfistigi"
  | "badem"
  | "kaju"
  | "ceviz";

// Product image metadata.
export interface ProductImage {
  url: string;
  alt: string;
  isPrimary: boolean;
  sortOrder: number;
}

// Nutrition summary.
export interface NutritionalInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number;
}

// Vitamin and mineral values.
export interface Vitamins {
  a?: string;
  c?: string;
  d?: string;
  e?: string;
  calcium?: string;
  iron?: string;
  magnesium?: string;
  zinc?: string;
}

// Product dimensions.
export interface ProductDimensions {
  width?: number;
  height?: number;
  depth?: number;
  weight?: number;
}

// Discount rule shape.
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

// Product variant shape.
export interface ProductVariant {
  id: string;
  name: string;
  weight: number | string;
  price: number;
  originalPrice?: number;
  cost?: number;
  stock: number;
  sku: string;
  barcode?: string;
  groupName?: string;
  images?: string[];
  unit?: "adet" | "kg" | "g" | "lt" | "ml" | "paket" | "kutu";
  maxPurchaseQuantity?: number;
  warehouseLocation?: string;
  attributes?: Array<Record<string, unknown>>;
  raw_attributes?: Array<Record<string, unknown>>;
}

export interface ProductReview {
  id: string;
  productId: string;
  variantId?: string | null;
  reviewerName: string;
  reviewerEmail?: string | null;
  rating: number;
  title?: string | null;
  body: string;
  imageUrls: string[];
  createdAt: string;
}

// SEO metadata for a product.
export interface ProductSEO {
  title: string;
  description: string;
  keywords: string[];
  focusKeyword?: string;
  ogImage?: string;
  canonicalUrl?: string;
  robots: "index,follow" | "noindex,follow" | "index,nofollow" | "noindex,nofollow";
}

// Stock management options.
export interface StockSettings {
  trackStock: boolean;
  lowStockThreshold: number;
}

// Nutrition settings.
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

// Product data used across storefront views.
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
  images_v2?: Array<string | { url?: string | null }>;
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
  seo_title?: string;
  seo_description?: string;
  discount?: number;
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

// Category data used across homepage and listing views.
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

// Filter shape for product listings.
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

// Product sorting options.
export type ProductSortOption =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "popular";

// Wizard form state kept for compatibility with admin-fed product editing flows.
export interface ProductWizardState {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: ProductCategory | "";
  subcategory: ProductSubcategory | "";
  tags: string[];
  brand: string;
  countryOfOrigin: string;
  images: ProductImage[];
  variants: ProductVariant[];
  taxRate: TaxRate;
  discountRules: DiscountRule[];
  trackStock: boolean;
  lowStockThreshold: number;
  seo: ProductSEO;
  nutritionalInfo: NutritionalInfo;
  nutritionSettings: NutritionSettings;
  vegan: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  highProtein: boolean;
  status: ProductStatus;
  publishedAt?: string;
}

export interface WizardStep {
  id: number;
  title: string;
  description: string;
  icon: string;
  isRequired: boolean;
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: 1,
    title: "Temel Bilgiler",
    description: "Urun adi, kategori ve aciklama",
    icon: "FileText",
    isRequired: true,
  },
  {
    id: 2,
    title: "Gorseller",
    description: "Fotograflar ve SEO optimizasyonu",
    icon: "Image",
    isRequired: true,
  },
  {
    id: 3,
    title: "Fiyatlandirma",
    description: "Varyantlar ve indirimler",
    icon: "Tag",
    isRequired: true,
  },
  {
    id: 4,
    title: "Stok Yonetimi",
    description: "Stok takip ayarlari",
    icon: "Package",
    isRequired: false,
  },
  {
    id: 5,
    title: "SEO & Meta",
    description: "Arama motoru optimizasyonu",
    icon: "Search",
    isRequired: true,
  },
  {
    id: 6,
    title: "Besin Degerleri",
    description: "Urun icerik bilgileri",
    icon: "Apple",
    isRequired: false,
  },
  {
    id: 7,
    title: "Onizle & Yayinla",
    description: "Son kontrol ve yayinlama",
    icon: "CheckCircle",
    isRequired: true,
  },
];
