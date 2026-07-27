import {
  PAYTR_IFRAME_PACKET,
  createPaymentAdapterRegistry,
  createPaytrIframeAdapter,
  type HostedPaymentAdapter,
  type PaymentAdapterRegistry,
  type ProviderTransport,
} from "@celebix/payment-adapters";
import type { MerchantAdminJson } from "@celebix/saas-contracts";
import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";

import {
  createCustomerPanelProviderRegistry,
  type MerchantProviderRegistry,
  type MerchantProviderRegistryEntry,
} from "../server-provider-execution/registry.ts";

const DEFAULT_PROVIDER_CODES = Object.freeze(["paytr_iframe"] as const);
const PUBLIC_KEYS = Object.freeze(["environment", "merchantId"] as const);
const CREDENTIAL_KEYS = Object.freeze(["merchantKey", "merchantSalt"] as const);
const ENCODER = new TextEncoder();

function invalid(): never {
  throw new TypeError("customer_panel_payment_adapter_invalid");
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return selected;
}

function wipeCredential(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  for (const key of ["merchantId", "merchantKey", "merchantSalt"]) {
    try { Reflect.set(value, key, ""); } catch { /* best effort */ }
  }
}

function paytrEntry(
  adapter: HostedPaymentAdapter<object>,
  executionAuthority: Readonly<PaymentProviderExecutionAuthority> | null,
): MerchantProviderRegistryEntry {
  if (
    adapter.packet !== PAYTR_IFRAME_PACKET ||
    adapter.packet.providerCode !== "paytr_iframe" ||
    adapter.packet.adapterVersion !== 1
  ) invalid();
  const publicFields = Object.freeze(adapter.packet.publicFields.map(({ key, label }) =>
    Object.freeze({ key, label })));
  const credentialFields = Object.freeze(adapter.packet.credentialFields.map(({ key, label }) =>
    Object.freeze({ key, label, secret: true as const })));

  function parsePublicConfig(value: unknown): Readonly<Record<string, MerchantAdminJson>> {
    try {
      const selected = exactRecord(value, PUBLIC_KEYS);
      if (selected.environment !== "test") invalid();
      const credential = adapter.parseCredential({
        merchantId: selected.merchantId,
        merchantKey: "validation-placeholder",
        merchantSalt: "validation-placeholder",
      });
      wipeCredential(credential);
      return Object.freeze({ environment: "test", merchantId: selected.merchantId as string });
    } catch {
      return invalid();
    }
  }

  function parseCredential(
    value: unknown,
    publicConfig: Readonly<Record<string, MerchantAdminJson>>,
  ): Uint8Array {
    let parsedCredential: object | undefined;
    try {
      const publicValues = parsePublicConfig(publicConfig);
      const selected = exactRecord(value, CREDENTIAL_KEYS);
      parsedCredential = adapter.parseCredential({
        merchantId: publicValues.merchantId,
        merchantKey: selected.merchantKey,
        merchantSalt: selected.merchantSalt,
      });
      const bytes = ENCODER.encode(JSON.stringify({
        merchantKey: selected.merchantKey,
        merchantSalt: selected.merchantSalt,
      }));
      if (bytes.byteLength < 1 || bytes.byteLength > 16_384) {
        bytes.fill(0);
        invalid();
      }
      return bytes;
    } catch {
      return invalid();
    } finally {
      wipeCredential(parsedCredential);
    }
  }

  function maskAccountReference(
    value: Readonly<Record<string, MerchantAdminJson>>,
  ): string {
    let parsedCredential: object | undefined;
    try {
      const publicConfig = parsePublicConfig(value);
      parsedCredential = adapter.parseCredential({
        merchantId: publicConfig.merchantId,
        merchantKey: "mask-placeholder",
        merchantSalt: "mask-placeholder",
      });
      return adapter.maskAccount(parsedCredential);
    } catch {
      return invalid();
    } finally {
      wipeCredential(parsedCredential);
    }
  }

  return Object.freeze({
    providerCode: PAYTR_IFRAME_PACKET.providerCode,
    capability: "payment_processing" as const,
    label: "PayTR iFrame",
    publicFields,
    credentialFields,
    adapterVersion: adapter.packet.adapterVersion,
    environments: Object.freeze(["test"] as const),
    executionAuthority,
    parsePublicConfig,
    parseCredential,
    maskAccountReference,
  });
}

export function createDefaultHostedPaymentAdapterRegistry(
  transport: ProviderTransport,
): PaymentAdapterRegistry {
  const adapter = createPaytrIframeAdapter(transport);
  return createPaymentAdapterRegistry([PAYTR_IFRAME_PACKET], [adapter]);
}

export function createDefaultCustomerPanelPaymentProviderRegistry(
  hosted: PaymentAdapterRegistry,
  executionAuthority: Readonly<PaymentProviderExecutionAuthority> | null = null,
): MerchantProviderRegistry {
  try {
    if (hosted.size !== 1) invalid();
    const adapter = hosted.adapter("paytr_iframe");
    if (adapter === null || hosted.packet("paytr_iframe") !== PAYTR_IFRAME_PACKET) invalid();
    if (executionAuthority !== null && (
      executionAuthority.environment !== "test" ||
      executionAuthority.adapterVersion !== adapter.packet.adapterVersion ||
      !/^sha256:[a-f0-9]{64}$/.test(executionAuthority.evidenceDigest)
    )) invalid();
    return createCustomerPanelProviderRegistry([paytrEntry(adapter, executionAuthority)]);
  } catch {
    return invalid();
  }
}

export function listDefaultCustomerPanelPaymentProviderCodes(): readonly string[] {
  return DEFAULT_PROVIDER_CODES;
}
