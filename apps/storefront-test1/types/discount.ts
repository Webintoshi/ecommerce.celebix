export type DiscountType = "fixed" | "percentage";
export type DiscountStatus = "active" | "scheduled" | "expired" | "draft";
export type DiscountScope = "all" | "products" | "collections" | "customers";
export type DiscountVisibility = "public" | "private" | "password";
export type DiscountLimitType = "once" | "once_per_customer" | "unlimited";

export interface AdminDiscount {
  id: string;
  name: string;
  description?: string;
  code: string;
  type: DiscountType;
  status: DiscountStatus;
  value: number;
  minOrder: number;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  scope: DiscountScope;
  visibility: DiscountVisibility;
  password?: string;
  limitType: DiscountLimitType;
  tags: string[];
  notes?: string;
  createdAt: string | null;
}

export interface AdminDiscountPayload {
  code: string;
  type: DiscountType;
  value: number;
  minOrder?: number;
  maxUses?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
  metadata: {
    name: string;
    description?: string;
    scope?: DiscountScope;
    visibility?: DiscountVisibility;
    password?: string;
    limitType?: DiscountLimitType;
    tags?: string[];
    notes?: string;
  };
}

export const DISCOUNT_TYPE_OPTIONS: Array<{
  value: DiscountType;
  label: string;
  description: string;
}> = [
  { value: "percentage", label: "Yüzde İndirim", description: "Sipariş tutarı üzerinden yüzde indirim" },
  { value: "fixed", label: "Sabit Tutar", description: "Siparişten sabit tutar düşer" },
];

export const DISCOUNT_STATUS_OPTIONS: Array<{
  value: DiscountStatus;
  label: string;
}> = [
  { value: "active", label: "Aktif" },
  { value: "scheduled", label: "Planlandı" },
  { value: "expired", label: "Süresi Doldu" },
  { value: "draft", label: "Taslak" },
];

export const DISCOUNT_SCOPE_OPTIONS: Array<{
  value: DiscountScope;
  label: string;
}> = [
  { value: "all", label: "Tüm Siparişler" },
  { value: "products", label: "Seçili Ürünler" },
  { value: "collections", label: "Koleksiyonlar" },
  { value: "customers", label: "Seçili Müşteriler" },
];

export const DISCOUNT_VISIBILITY_OPTIONS: Array<{
  value: DiscountVisibility;
  label: string;
}> = [
  { value: "public", label: "Herkese Açık" },
  { value: "private", label: "Özel" },
  { value: "password", label: "Parola Korumalı" },
];

export const DISCOUNT_LIMIT_TYPE_OPTIONS: Array<{
  value: DiscountLimitType;
  label: string;
}> = [
  { value: "unlimited", label: "Sınırsız" },
  { value: "once", label: "Toplam Limitli" },
  { value: "once_per_customer", label: "Müşteri Başı (Takip Dışı)" },
];

// Compatibility types for legacy modules.
export interface Discount {
  id: string;
  name: string;
  description?: string;
  code: string;
  type: DiscountType;
  status: DiscountStatus;
  value: number;
  minValue?: number;
  maxValue?: number;
  currency?: string;
  scope: DiscountScope;
  visibility: DiscountVisibility;
  password?: string;
  startDate: Date;
  endDate: Date;
  products?: Array<{ productId: string; productName: string; discount: number }>;
  collections?: string[];
  customers?: Array<{ customerId: string; customerName: string }>;
  rules: {
    minimumOrderAmount?: number;
    maximumDiscountAmount?: number;
    minimumQuantity?: number;
    requireCoupon?: boolean;
    excludeSaleItems?: boolean;
  };
  limitType: DiscountLimitType;
  usageLimit?: number;
  usedCount: number;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  notes?: string;
}

export interface DiscountFormData {
  id?: string;
  name: string;
  description?: string;
  code: string;
  type: DiscountType;
  status: DiscountStatus;
  value: number;
  minValue?: number;
  maxValue?: number;
  currency?: string;
  scope: DiscountScope;
  visibility: DiscountVisibility;
  password?: string;
  startDate: Date;
  endDate: Date;
  products?: Array<{ productId: string; productName: string; discount: number }>;
  collections?: string[];
  customers?: Array<{ customerId: string; customerName: string }>;
  rules: {
    minimumOrderAmount?: number;
    maximumDiscountAmount?: number;
    minimumQuantity?: number;
    requireCoupon?: boolean;
    excludeSaleItems?: boolean;
  };
  limitType: DiscountLimitType;
  usageLimit?: number;
  tags?: string[];
  notes?: string;
}
