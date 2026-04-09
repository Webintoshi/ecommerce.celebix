import type {
  DiscountRule,
  ProductImage,
  ProductSEO,
  ProductStatus,
  ProductVariant,
  TaxRate,
} from "@/types/product";

export interface AdminProductWizardState {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: string;
  subcategory: string;
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
  status: ProductStatus;
  publishedAt?: string;
}

export interface AdminWizardStep {
  id: number;
  title: string;
  description: string;
  icon: string;
  isRequired: boolean;
}

export const ADMIN_PRODUCT_WIZARD_STEPS: AdminWizardStep[] = [
  {
    id: 1,
    title: "Temel Bilgiler",
    description: "İsim, kategori ve açıklama",
    icon: "FileText",
    isRequired: true,
  },
  {
    id: 2,
    title: "Görseller",
    description: "Ürün medya alanları",
    icon: "Image",
    isRequired: true,
  },
  {
    id: 3,
    title: "Fiyatlandırma",
    description: "Varyantlar ve ücretlendirme",
    icon: "Tag",
    isRequired: true,
  },
  {
    id: 4,
    title: "Stok Yönetimi",
    description: "Stok takibi ve limitler",
    icon: "Package",
    isRequired: false,
  },
  {
    id: 5,
    title: "SEO & Meta",
    description: "Arama görünürlüğü ayarları",
    icon: "Search",
    isRequired: true,
  },
  {
    id: 6,
    title: "Önizle & Yayınla",
    description: "Son kontrol ve kaydetme",
    icon: "CheckCircle",
    isRequired: true,
  },
];
