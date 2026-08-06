import type { ShippingProviderCode } from "@celebix/saas-contracts";

import type {
  ShippingProviderAdapter,
  ShippingProviderMutationFailure,
  ShippingProviderReadFailure,
} from "./contracts.ts";

const NOT_READY_READ = Object.freeze({
  kind: "temporary_failure" as const,
  safeCode: "adapter_not_ready",
}) satisfies ShippingProviderReadFailure;
const NOT_READY_MUTATION = NOT_READY_READ satisfies ShippingProviderMutationFailure;

const basitKargoBoundary = Object.freeze({
  providerCode: "basit_kargo" as const,
  parseCredential(): never {
    throw new TypeError("shipping_credential_invalid");
  },
  async verifyCredential() { return NOT_READY_READ; },
  async listBrands() { return NOT_READY_READ; },
  async listSenderAddresses() { return NOT_READY_READ; },
  async listHandlers() { return NOT_READY_READ; },
  async quotePackages() { return NOT_READY_READ; },
  async createShipment() { return NOT_READY_MUTATION; },
  async getShipment() { return NOT_READY_READ; },
  async cancelShipment() { return NOT_READY_MUTATION; },
  async createReturnShipment() { return NOT_READY_MUTATION; },
  async downloadLabel() { return NOT_READY_READ; },
}) satisfies ShippingProviderAdapter<Record<string, never>>;

const REGISTRY: ReadonlyMap<ShippingProviderCode, ShippingProviderAdapter<object>> = new Map([
  ["basit_kargo", basitKargoBoundary],
]);

export function resolveShippingProviderAdapter(providerCode: ShippingProviderCode): ShippingProviderAdapter<object> {
  const adapter = REGISTRY.get(providerCode);
  if (adapter === undefined) throw new TypeError("shipping_provider_not_registered");
  return adapter;
}
