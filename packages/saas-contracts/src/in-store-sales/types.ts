export const IN_STORE_SALE_STATUSES = Object.freeze(['draft','held','payment_pending','payment_received','completed','cancelled'] as const);
export type InStoreSaleStatus = typeof IN_STORE_SALE_STATUSES[number];
export type InStoreDiscount = Readonly<{kind:'percentage';percentageBps:number}|{kind:'fixed_amount';amountCents:number}>;
export interface InStoreSaleIntent {
  readonly locationId:string;
  readonly items:readonly Readonly<{variantId:string;quantity:number}>[];
  readonly discount:InStoreDiscount|null;
  readonly customerName:string|null;
  readonly note:string|null;
}
export interface InStoreProduct {
  readonly productId:string;readonly variantId:string;readonly productName:string;readonly variantName:string;
  readonly sku:string|null;readonly barcode:string|null;readonly imageUrl:string|null;
  readonly unitPriceCents:number|null;readonly pricingUnavailable:boolean;
  readonly availableQuantity:number;readonly stockTracking:boolean;readonly discountEligible:boolean;
}
export interface InStoreSaleLine {
  readonly productId:string;readonly variantId:string;readonly productName:string;readonly variantName:string;
  readonly sku:string|null;readonly barcode:string|null;readonly imageUrl:string|null;
  readonly unitPriceCents:number;readonly quantity:number;readonly discountEligible:boolean;
  readonly lineSubtotalCents:number;readonly allocatedDiscountCents:number;readonly lineNetCents:number;
}
export interface InStoreSaleTotals {
  readonly subtotalCents:number;readonly eligibleSubtotalCents:number;readonly discountCents:number;readonly totalCents:number;
}
export interface InStoreSale {
  readonly id:string;readonly saleNumber:string;readonly status:InStoreSaleStatus;readonly version:number;
  readonly locationId:string;readonly locationName:string;readonly ownerMembershipId:string;readonly ownerLabel:string;
  readonly customerName:string|null;readonly note:string|null;readonly discount:InStoreDiscount|null;
  readonly items:readonly InStoreSaleLine[];readonly totals:InStoreSaleTotals;
  readonly createdAt:string;readonly updatedAt:string;readonly paymentReceivedAt:string|null;
  readonly completedAt:string|null;readonly orderId:string|null;readonly orderNumber:string|null;
}
export interface InStoreSaleResult { readonly sale:InStoreSale;readonly replayed:boolean;readonly priceChanged:boolean; }
export interface InStorePermissions { readonly canSell:boolean;readonly canDiscount:boolean;readonly discountLimitBps:number;readonly canResolve:boolean;readonly canManageStaff:boolean; }
export interface InStoreBootstrap {
  readonly scopeKey:string;
  readonly locations:readonly Readonly<{id:string;name:string;isDefault:boolean}>[];
  readonly permissions:InStorePermissions;readonly activeDraft:InStoreSale|null;
  readonly heldSales:readonly InStoreSale[];readonly pendingSales:readonly InStoreSale[];readonly recentSales:readonly InStoreSale[];
  readonly summary:Readonly<{completedCount:number;grossCents:number;discountCents:number;netCents:number;pendingPaymentCount:number}>;
}
export interface InStoreSalePage { readonly sales:readonly InStoreSale[];readonly nextCursor:string|null; }
export interface InStoreStaffGrant {
  readonly membershipId:string;readonly label:string;readonly role:string;readonly enabled:boolean;
  readonly locationIds:readonly string[];readonly discountLimitBps:number;readonly version:number;
}
