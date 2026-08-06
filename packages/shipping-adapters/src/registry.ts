import type { ShippingProviderCode } from "@celebix/saas-contracts";

import type { ShippingProviderAdapter } from "./contracts.ts";
import { BasitKargoAdapter } from "./providers/basit-kargo/adapter.ts";

const basitKargoAdapter = new BasitKargoAdapter();

const REGISTRY: ReadonlyMap<ShippingProviderCode, ShippingProviderAdapter<object>> = new Map([
  ["basit_kargo", basitKargoAdapter],
]);

export function resolveShippingProviderAdapter(providerCode: ShippingProviderCode): ShippingProviderAdapter<object> {
  const adapter = REGISTRY.get(providerCode);
  if (adapter === undefined) throw new TypeError("shipping_provider_not_registered");
  return adapter;
}
