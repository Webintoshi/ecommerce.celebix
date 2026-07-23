export const PRICE_CHANNELS = Object.freeze([
  "storefront",
  "quick_order",
] as const);
export type PriceChannel = (typeof PRICE_CHANNELS)[number];

export const PRICE_LIST_STATUSES = Object.freeze([
  "draft",
  "active",
  "archived",
] as const);
export type PriceListStatus = (typeof PRICE_LIST_STATUSES)[number];

export const PRICE_SOURCE_KINDS = Object.freeze([
  "base",
  "price_list",
] as const);
export type PriceSourceKind = (typeof PRICE_SOURCE_KINDS)[number];

export interface PriceListItem {
  readonly variantId: string;
  readonly priceCents: number;
}

export interface PriceListRule {
  readonly channel: PriceChannel;
  readonly customerTagId?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly priority: number;
}

export interface PriceList {
  readonly id: string;
  readonly name: string;
  readonly status: PriceListStatus;
  readonly items: readonly PriceListItem[];
  readonly rules: readonly PriceListRule[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activatedAt?: string;
  readonly archivedAt?: string;
}

export interface EffectivePrice {
  readonly variantId: string;
  readonly channel: PriceChannel;
  readonly priceCents: number;
  readonly sourceKind: PriceSourceKind;
  readonly priceListId?: string;
}
