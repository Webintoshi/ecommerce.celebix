import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type PublicAbandonedCartItemInput = Readonly<{
  productId: string;
  variantId: string;
  quantity: number;
}>;

export type PublicAbandonedCartCustomerInput = Readonly<{
  name?: string;
  email?: string;
  phone?: string;
}>;

export type CapturePublicAbandonedCartInput = Readonly<{
  hostname: string;
  cartId: string;
  credentialDigest: string;
  now: Date;
  customer: PublicAbandonedCartCustomerInput;
  items: readonly PublicAbandonedCartItemInput[];
}>;

export type ConvertPublicAbandonedCartInput = Readonly<{
  hostname: string;
  credentialDigest: string;
  orderId: string;
  now: Date;
}>;

export type MarkStaleAbandonedCartsInput = Readonly<{
  now: Date;
  staleBefore: Date;
}>;

export type PublicAbandonedCartResult = Readonly<{
  id: string;
  status: "active" | "recovered" | "archived";
  currency: string;
  totalCents: number;
  itemCount: number;
  version: number;
  updatedAt: string;
}>;

export type MarkStaleAbandonedCartsResult = Readonly<{
  affected: number;
  asOf: string;
}>;

export interface PublicAbandonedCartRepository {
  capture(input: CapturePublicAbandonedCartInput): Promise<PublicAbandonedCartResult>;
  markStale(input: MarkStaleAbandonedCartsInput): Promise<MarkStaleAbandonedCartsResult>;
  convert(input: ConvertPublicAbandonedCartInput): Promise<PublicAbandonedCartResult>;
}

export type PublicAbandonedCartRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_workflow";
  timeouts: PostgresTimeoutOptions;
  audit: (event: Readonly<{ type: "abandoned_cart_capture_commit_unknown" }>) => void | Promise<void>;
}>;
