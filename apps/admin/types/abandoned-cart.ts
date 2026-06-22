export interface AbandonedCart {
  id: string;
  cartId?: string;
  userId?: string;
  sessionId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  isAnonymous: boolean;
  items: AbandonedCartItem[];
  total: number;
  itemCount: number;
  status?: "active" | "abandoned" | "recovered" | "cleared";
  createdAt: Date;
  updatedAt: Date;
  checkoutStartedAt?: Date | string;
  lastActivityAt?: Date | string;
  recovered?: boolean;
  recoveredAt?: Date;
  orderId?: string;
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
