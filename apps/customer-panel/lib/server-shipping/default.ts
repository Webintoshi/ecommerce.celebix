import { randomUUID } from "node:crypto";

import {
  resolveShippingProviderAdapter,
  type BasitKargoCredential,
  type ShippingProviderAdapter,
} from "@celebix/shipping-adapters";

export function createDefaultShippingAdapter(): ShippingProviderAdapter<BasitKargoCredential> {
  return resolveShippingProviderAdapter("basit_kargo") as ShippingProviderAdapter<BasitKargoCredential>;
}

export function generateShippingId(): string {
  return randomUUID();
}
