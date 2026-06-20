export interface AbandonedCart {
  id: string;
  cartId?: string | null;
  storeSlug?: string | null;
  userId?: string;
  customerId?: string | null;
  sessionId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAnonymous: boolean;
  items: AbandonedCartItem[];
  total: number;
  itemCount: number;
  status?: "active" | "abandoned" | "recovered" | "cleared";
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  lastActivityAt?: Date | string | null;
  checkoutStartedAt?: Date | string | null;
  recovered?: boolean;
  recoveredAt?: Date | string | null;
  abandonedAt?: Date | string | null;
  orderId?: string | null;
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
  status?: "all" | "active" | "abandoned" | "recovered" | "cleared";
  isAnonymous?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  minTotal?: number;
  maxTotal?: number;
  search?: string;
}

export type AbandonedCartSort = "date-desc" | "date-asc" | "total-desc" | "total-asc";
