import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import {
  IYZICO_APPROVED_EXECUTION_AUTHORITY,
  IYZICO_IFRAME_PACKET,
  IYZICO_GENERATED_BUILD_METADATA,
  PAYTR_APPROVED_EXECUTION_AUTHORITIES,
  PAYTR_IFRAME_PACKET,
  createIyzicoCheckoutFormAdapter,
  createPaymentAdapterRegistry,
  createPaytrIframeAdapter,
  type HostedPaymentAdapter,
  type IyzicoCandidateBuildMetadata,
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

const DEFAULT_PROVIDER_CODES = Object.freeze(["iyzico_iframe", "paytr_iframe"] as const);
const PUBLIC_KEYS = Object.freeze(["environment", "merchantId"] as const);
const CREDENTIAL_KEYS = Object.freeze(["merchantKey", "merchantSalt"] as const);
const ENCODER = new TextEncoder();
type Environment = Readonly<Record<string, string | undefined>>;

export type CustomerPanelPaymentActivationMode =
  | "disabled"
  | "approved_test_sandbox";

function invalid(): never {
  throw new TypeError("customer_panel_payment_adapter_invalid");
}

export function resolveCustomerPanelPaymentActivationMode(
  source: Environment,
): CustomerPanelPaymentActivationMode {
  return source.CELEBIX_PAYTR_IFRAME_PANEL_MODE === "approved_test_sandbox"
    ? "approved_test_sandbox"
    : "disabled";
}

const IYZICO_BUILD_METADATA_KEYS = Object.freeze([
  "buildMetadataSchemaVersion",
  "evidenceSchemaVersion",
  "providerCode",
  "capability",
  "environment",
  "adapterVersion",
  "gitSha",
  "sourceDigest",
  "candidateExecutionDigest",
] as const);

function exactIyzicoBuildMetadata(value: unknown): IyzicoCandidateBuildMetadata | null {
  try {
    if (
      typeof value !== "object" || value === null || Array.isArray(value)
      || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    ) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(descriptors).length !== IYZICO_BUILD_METADATA_KEYS.length
      || IYZICO_BUILD_METADATA_KEYS.some((key) => {
        const descriptor = descriptors[key];
        return !descriptor || !descriptor.enumerable || !("value" in descriptor);
      })
    ) return null;
    const selected = Object.fromEntries(IYZICO_BUILD_METADATA_KEYS.map((key) => [
      key,
      descriptors[key]!.value,
    ])) as IyzicoCandidateBuildMetadata;
    if (
      selected.buildMetadataSchemaVersion !== 1
      || selected.evidenceSchemaVersion !== 1
      || selected.providerCode !== "iyzico_iframe"
      || selected.capability !== "payment_processing"
      || selected.environment !== "test"
      || selected.adapterVersion !== IYZICO_IFRAME_PACKET.adapterVersion
      || typeof selected.gitSha !== "string"
      || !/^[a-f0-9]{40}$/.test(selected.gitSha)
      || typeof selected.sourceDigest !== "string"
      || !/^sha256:[a-f0-9]{64}$/.test(selected.sourceDigest)
      || typeof selected.candidateExecutionDigest !== "string"
      || !/^sha256:[a-f0-9]{64}$/.test(selected.candidateExecutionDigest)
    ) return null;
    const canonicalCandidate = Object.freeze({
      evidenceSchemaVersion: 1,
      providerCode: "iyzico_iframe",
      capability: "payment_processing",
      environment: "test",
      adapterVersion: IYZICO_IFRAME_PACKET.adapterVersion,
      gitSha: selected.gitSha,
      sourceDigest: selected.sourceDigest,
    });
    const digest = `sha256:${createHash("sha256").update(JSON.stringify(canonicalCandidate)).digest("hex")}`;
    return digest === selected.candidateExecutionDigest ? selected : null;
  } catch {
    return null;
  }
}

export function resolveIyzicoCompiledExecutionAuthority(
  approved: unknown = IYZICO_APPROVED_EXECUTION_AUTHORITY,
  generated: unknown = IYZICO_GENERATED_BUILD_METADATA,
): Readonly<PaymentProviderExecutionAuthority> | null {
  try {
    const metadata = exactIyzicoBuildMetadata(generated);
    if (
      metadata === null
      || !exactExecutionAuthority(approved, IYZICO_IFRAME_PACKET.adapterVersion)
      || approved.evidenceDigest !== metadata.candidateExecutionDigest
    ) return null;
    return Object.freeze({
      environment: approved.environment,
      adapterVersion: approved.adapterVersion,
      evidenceDigest: approved.evidenceDigest,
    });
  } catch {
    return null;
  }
}

export function resolvePaytrCompiledExecutionAuthority(
  approved: unknown = PAYTR_APPROVED_EXECUTION_AUTHORITIES.test,
): Readonly<PaymentProviderExecutionAuthority> | null {
  try {
    if (!exactExecutionAuthority(approved, PAYTR_IFRAME_PACKET.adapterVersion)) return null;
    return Object.freeze({
      environment: approved.environment,
      adapterVersion: approved.adapterVersion,
      evidenceDigest: approved.evidenceDigest,
    });
  } catch {
    return null;
  }
}

function exactExecutionAuthority(
  value: unknown,
  adapterVersion: number,
): value is Readonly<PaymentProviderExecutionAuthority> {
  try {
    if (
      typeof value !== "object" || value === null || Array.isArray(value)
      || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    ) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = ["environment", "adapterVersion", "evidenceDigest"];
    return Reflect.ownKeys(descriptors).length === keys.length
      && keys.every((key) => descriptors[key]?.enumerable === true && "value" in descriptors[key]!)
      && descriptors.environment?.value === "test"
      && descriptors.adapterVersion?.value === adapterVersion
      && typeof descriptors.evidenceDigest?.value === "string"
      && /^sha256:[a-f0-9]{64}$/.test(descriptors.evidenceDigest.value);
  } catch {
    return false;
  }
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
  for (const key of ["merchantId", "merchantKey", "merchantSalt", "apiKey", "secretKey"]) {
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
      if (
        selected.environment !== "test" &&
        (executionAuthority !== null || selected.environment !== "live")
      ) invalid();
      const credential = adapter.parseCredential({
        merchantId: selected.merchantId,
        merchantKey: "validation-placeholder",
        merchantSalt: "validation-placeholder",
      });
      wipeCredential(credential);
      return Object.freeze({
        environment: selected.environment,
        merchantId: selected.merchantId as string,
      });
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
    environments: executionAuthority === null
      ? Object.freeze(["test", "live"] as const)
      : Object.freeze(["test"] as const),
    executionAuthority,
    profileSaveMode: executionAuthority === null
      ? "verification" as const
      : "execution_authority" as const,
    parsePublicConfig,
    parseCredential,
    maskAccountReference,
  });
}

function iyzicoEntry(
  adapter: HostedPaymentAdapter<object>,
  executionAuthority: Readonly<PaymentProviderExecutionAuthority> | null,
): MerchantProviderRegistryEntry {
  if (
    adapter.packet !== IYZICO_IFRAME_PACKET ||
    adapter.packet.providerCode !== "iyzico_iframe" ||
    adapter.packet.adapterVersion !== 1
  ) invalid();
  const publicFields = Object.freeze(adapter.packet.publicFields.map(({ key, label }) =>
    Object.freeze({ key, label })));
  const credentialFields = Object.freeze(adapter.packet.credentialFields.map(({ key, label }) =>
    Object.freeze({ key, label, secret: true as const })));

  function parsePublicConfig(value: unknown): Readonly<Record<string, MerchantAdminJson>> {
    const selected = exactRecord(value, ["environment"]);
    if (
      selected.environment !== "test"
      && (executionAuthority !== null || selected.environment !== "live")
    ) invalid();
    return Object.freeze({ environment: selected.environment });
  }

  function parseCredential(
    value: unknown,
    publicConfig: Readonly<Record<string, MerchantAdminJson>>,
  ): Uint8Array {
    let parsedCredential: object | undefined;
    try {
      parsePublicConfig(publicConfig);
      const selected = exactRecord(value, ["apiKey", "secretKey"]);
      parsedCredential = adapter.parseCredential({
        apiKey: selected.apiKey,
        secretKey: selected.secretKey,
      });
      const bytes = ENCODER.encode(JSON.stringify({
        apiKey: selected.apiKey,
        secretKey: selected.secretKey,
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
    const publicConfig = parsePublicConfig(value);
    return `iyzico ${publicConfig.environment} hesabı`;
  }

  return Object.freeze({
    providerCode: IYZICO_IFRAME_PACKET.providerCode,
    capability: "payment_processing" as const,
    label: "iyzico · Checkout Form",
    publicFields,
    credentialFields,
    adapterVersion: adapter.packet.adapterVersion,
    environments: executionAuthority === null
      ? Object.freeze(["test", "live"] as const)
      : Object.freeze(["test"] as const),
    executionAuthority,
    profileSaveMode: executionAuthority === null
      ? "verification" as const
      : "execution_authority" as const,
    parsePublicConfig,
    parseCredential,
    maskAccountReference,
  });
}

export function createDefaultHostedPaymentAdapterRegistry(
  transport: ProviderTransport,
): PaymentAdapterRegistry {
  const paytr = createPaytrIframeAdapter(transport);
  const iyzico = createIyzicoCheckoutFormAdapter(transport);
  return createPaymentAdapterRegistry(
    [PAYTR_IFRAME_PACKET, IYZICO_IFRAME_PACKET],
    [paytr, iyzico],
  );
}

export function createDefaultCustomerPanelPaymentProviderRegistry(
  hosted: PaymentAdapterRegistry,
  executionAuthority: Readonly<PaymentProviderExecutionAuthority> | null = PAYTR_APPROVED_EXECUTION_AUTHORITIES.test,
  activationMode: CustomerPanelPaymentActivationMode = "disabled",
  iyzicoApproval: unknown = IYZICO_APPROVED_EXECUTION_AUTHORITY,
  iyzicoBuild: unknown = IYZICO_GENERATED_BUILD_METADATA,
): MerchantProviderRegistry {
  try {
    if (hosted.size !== 2) invalid();
    const adapter = hosted.adapter("paytr_iframe");
    const iyzico = hosted.adapter("iyzico_iframe");
    if (
      adapter === null || hosted.packet("paytr_iframe") !== PAYTR_IFRAME_PACKET ||
      iyzico === null || hosted.packet("iyzico_iframe") !== IYZICO_IFRAME_PACKET
    ) invalid();
    if (executionAuthority !== null && (
      executionAuthority.environment !== "test" ||
      executionAuthority.adapterVersion !== adapter.packet.adapterVersion ||
      !/^sha256:[a-f0-9]{64}$/.test(executionAuthority.evidenceDigest)
    )) invalid();
    if (activationMode !== "disabled" && activationMode !== "approved_test_sandbox") invalid();
    const paytrAuthority = activationMode === "approved_test_sandbox"
      ? resolvePaytrCompiledExecutionAuthority(executionAuthority)
      : null;
    const iyzicoAuthority = resolveIyzicoCompiledExecutionAuthority(iyzicoApproval, iyzicoBuild);
    return createCustomerPanelProviderRegistry([
      paytrEntry(adapter, paytrAuthority),
      iyzicoEntry(iyzico, iyzicoAuthority),
    ]);
  } catch {
    return invalid();
  }
}

export function listDefaultCustomerPanelPaymentProviderCodes(): readonly string[] {
  return DEFAULT_PROVIDER_CODES;
}
