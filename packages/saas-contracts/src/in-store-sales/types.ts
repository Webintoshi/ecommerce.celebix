import type {OrderAddress} from '../orders/types.ts';
export const IN_STORE_SALE_STATUSES = Object.freeze(['draft','held','payment_pending','payment_received','completed','cancelled'] as const);
export type InStoreSaleStatus = typeof IN_STORE_SALE_STATUSES[number];
export type InStoreDiscount = Readonly<{kind:'percentage';percentageBps:number}|{kind:'fixed_amount';amountCents:number}>;
export type InStorePaymentMethod = 'card' | 'cash' | 'bank_transfer';
export type InStoreContractVersion = 1 | 2 | 3 | 4;
export interface InStorePosCustomer { readonly id:string;readonly name:string;readonly firstName:string;readonly lastName:string;readonly phone:string|null;readonly email:string|null;readonly archived:boolean; }
export interface InStorePosCustomerIntent { readonly firstName:string;readonly lastName:string;readonly phone:string;readonly email:string|null; }
export interface InStoreFinanceReceipt { readonly reversed:boolean;readonly id:string;readonly amountCents:number;readonly paymentMethod:InStorePaymentMethod;readonly receivedAt:string;readonly actorMembershipId:string; }
export interface InStoreFinance { readonly status:'unpaid'|'partial'|'paid';readonly collectedCents:number;readonly dueCents:number;readonly refundDueCents:number;readonly version:number;readonly receipts:readonly InStoreFinanceReceipt[]; }
export interface InStorePosCustomerResult { readonly customer:InStorePosCustomer;readonly replayed:boolean; }
export type InStoreSalesChannel = 'manual'|'social';
export type InStoreSocialPlatform = 'instagram'|'facebook'|'x'|'pinterest'|'tiktok'|'whatsapp'|'other';
export interface InStorePaymentPart { readonly partId:string;readonly paymentMethod:InStorePaymentMethod;readonly amountCents:number; }
export interface InStoreSalePaymentPart extends InStorePaymentPart { readonly receiptId:string|null;readonly receivedAt:string|null;readonly actorMembershipId:string|null;readonly refundEventId:string|null;readonly returnedAt:string|null; }
export interface InStoreManualMetadata { readonly salesChannel?:InStoreSalesChannel;readonly socialPlatform?:InStoreSocialPlatform|null;readonly socialReference?:string|null;readonly fulfillmentMethod?:'pickup'|'shipping';readonly shippingAddress?:Readonly<OrderAddress>|null;readonly billingAddress?:Readonly<OrderAddress>|null;readonly shippingCents?:number; }
export interface InStoreSaleIntent extends InStoreManualMetadata {
  readonly paymentParts?:readonly InStorePaymentPart[];
  readonly customerId?:string|null;readonly initialCollectionCents?:number|null;readonly dueDate?:string|null;
  readonly paymentMethod?:InStorePaymentMethod|null;
  readonly locationId:string;
  readonly items:readonly Readonly<{variantId:string;quantity:number;unitPriceOverrideCents?:number|null}>[];
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
  readonly catalogUnitPriceCents?:number;readonly unitPriceOverrideCents?:number|null;readonly priceOverrideActorMembershipId?:string|null;
  readonly productId:string;readonly variantId:string;readonly productName:string;readonly variantName:string;
  readonly sku:string|null;readonly barcode:string|null;readonly imageUrl:string|null;
  readonly unitPriceCents:number;readonly quantity:number;readonly discountEligible:boolean;
  readonly lineSubtotalCents:number;readonly allocatedDiscountCents:number;readonly lineNetCents:number;
}
export interface InStoreSaleTotals {
  readonly shippingCents?:number;
  readonly subtotalCents:number;readonly eligibleSubtotalCents:number;readonly discountCents:number;readonly totalCents:number;
}
export interface InStoreSale extends InStoreManualMetadata {
  readonly paymentParts?:readonly InStoreSalePaymentPart[];readonly prepareOperationId?:string|null;readonly abortRequested?:boolean;
  readonly contractVersion?:InStoreContractVersion;readonly customerId?:string|null;readonly customer?:InStorePosCustomer|null;readonly initialCollectionCents?:number;readonly dueDate?:string|null;readonly finance?:InStoreFinance|null;
  readonly paymentMethod?:InStorePaymentMethod|null;
  readonly id:string;readonly saleNumber:string;readonly status:InStoreSaleStatus;readonly version:number;
  readonly locationId:string;readonly locationName:string;readonly ownerMembershipId:string;readonly ownerLabel:string;
  readonly customerName:string|null;readonly note:string|null;readonly discount:InStoreDiscount|null;
  readonly items:readonly InStoreSaleLine[];readonly totals:InStoreSaleTotals;
  readonly createdAt:string;readonly updatedAt:string;readonly paymentReceivedAt:string|null;
  readonly completedAt:string|null;readonly orderId:string|null;readonly orderNumber:string|null;
}
export interface InStoreSaleResult { readonly sale:InStoreSale;readonly replayed:boolean;readonly priceChanged:boolean; }
export interface InStorePermissions { readonly manualSalesV4Available?:boolean; readonly canSellOnCredit?:boolean;readonly canCollectReceivables?:boolean;readonly creditSalesAvailable?:boolean; readonly canEditPrice?:boolean; readonly canSell:boolean;readonly canDiscount:boolean;readonly discountLimitBps:number;readonly canResolve:boolean;readonly canManageStaff:boolean; }
export interface InStoreBootstrap {
  readonly scopeKey:string;
  readonly locations:readonly Readonly<{id:string;name:string;isDefault:boolean}>[];
  readonly permissions:InStorePermissions;readonly activeDraft:InStoreSale|null;
  readonly heldSales:readonly InStoreSale[];readonly pendingSales:readonly InStoreSale[];readonly recentSales:readonly InStoreSale[];
  readonly summary:Readonly<{completedCount:number;grossCents:number;discountCents:number;netCents:number;pendingPaymentCount:number}>;
}
export interface InStoreSalePage { readonly sales:readonly InStoreSale[];readonly nextCursor:string|null; }
export interface InStoreStaffGrant {
  readonly canSellOnCredit?:boolean;readonly canCollectReceivables?:boolean;
  readonly canEditPrice?:boolean;
  readonly membershipId:string;readonly label:string;readonly role:string;readonly enabled:boolean;
  readonly locationIds:readonly string[];readonly discountLimitBps:number;readonly version:number;
}
