// ============================================
// Dinamik Varyant Nitelikleri Tipleri
// ============================================

// Nitelik Grubu (Renk, Beden, Gramaj, vb.)
export interface VariantAttribute {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  // Join ile gelen değerler
  values?: VariantAttributeValue[];
}

// Nitelik Değeri (Kırmızı, S, 450g, vb.)
export interface VariantAttributeValue {
  id: string;
  attribute_id: string;
  value: string;
  color_code?: string | null;
  image_url?: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  // Join ile gelen nitelik bilgisi
  attribute?: VariantAttribute;
}

// Ürün Varyantı - Nitelik İlişkisi
export interface ProductVariantAttribute {
  id: string;
  product_variant_id: string;
  attribute_value_id: string;
  created_at?: string;
  // Join ile gelen değerler
  attribute_value?: VariantAttributeValue;
}

// Form/Create/Update için tipler
export interface CreateVariantAttributeInput {
  name: string;
  values: string[];  // Değerler string array olarak gelir
  hasColorCodes?: boolean;
}

export interface UpdateVariantAttributeInput {
  id: string;
  name?: string;
  is_active?: boolean;
}

export interface CreateVariantAttributeValueInput {
  attribute_id: string;
  value: string;
  color_code?: string;
  image_url?: string;
  display_order?: number;
}

export interface UpdateVariantAttributeValueInput {
  id: string;
  value?: string;
  color_code?: string;
  image_url?: string;
  display_order?: number;
  is_active?: boolean;
}

// Varyant formunda kullanılan tip
export interface VariantAttributeSelection {
  attributeId: string;
  attributeName: string;
  valueId: string;
  value: string;
  colorCode?: string | null;
  imageUrl?: string | null;
}

// API Response tipleri
export interface VariantAttributeListResponse {
  success: boolean;
  attributes: VariantAttribute[];
  error?: string;
}

export interface VariantAttributeDetailResponse {
  success: boolean;
  attribute: VariantAttribute;
  error?: string;
}
