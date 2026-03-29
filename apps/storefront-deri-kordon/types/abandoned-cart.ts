export interface AbandonedCart {
  id: string;
  userId?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  isAnonymous: boolean;
  items: AbandonedCartItem[];
  total: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
  recovered?: boolean;
  recoveredAt?: Date;
}

export interface AbandonedCartItem {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string;
  variantId: string;
  variantName: string;
  price: number;
  originalPrice?: number;
  quantity: number;
  stock: number;
}

export interface AbandonedCartFilters {
  isAnonymous?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  minTotal?: number;
  maxTotal?: number;
  search?: string;
}

export type AbandonedCartSort = "date-desc" | "date-asc" | "total-desc" | "total-asc";
