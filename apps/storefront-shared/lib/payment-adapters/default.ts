import "server-only";
import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import {
  IYZICO_APPROVED_EXECUTION_AUTHORITY,
  IYZICO_IFRAME_PACKET,
  IYZICO_GENERATED_BUILD_METADATA,
  PAYTR_IFRAME_PACKET,
  createIyzicoCheckoutFormAdapter,
  createPaymentAdapterRegistry,
  createPaytrIframeAdapter,
  type IyzicoCandidateBuildMetadata,
  type PaymentAdapterRegistry,
  type ProviderTransport,
} from "@celebix/payment-adapters";
import type {
  MerchantProviderCredentialKeyring,
  PaymentAttemptRepository,
} from "@celebix/saas-data";
import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";

import {
  createHostedPaymentRuntime,
  type HostedPaymentRuntime,
  type HostedPaymentRuntimeDependencies,
} from "./runtime.ts";

type Environment = Readonly<Record<string, string | undefined>>;
type HostedProviderCode = "paytr_iframe" | "iyzico_iframe";

export type StorefrontHostedPaymentActivationMode =
  | "disabled"
  | "approved_test_sandbox";

export type StorefrontHostedPaymentCompiledAuthorities = Readonly<{
  paytr_iframe: Readonly<PaymentProviderExecutionAuthority> | null;
  iyzico_iframe: Readonly<PaymentProviderExecutionAuthority> | null;
}>;
export type StorefrontHostedPaymentCompiledAuthoritySelector = (
  providerCode: string,
) => Readonly<{
  providerCode: "paytr_iframe" | "iyzico_iframe";
  environment: "test" | "live";
  adapterVersion: number;
  evidenceDigest: string;
}> | null;

type ActiveDependencies = Readonly<{
  attempts: PaymentAttemptRepository;
  keyring: MerchantProviderCredentialKeyring;
  transport: ProviderTransport;
  selectAuthority: HostedPaymentRuntimeDependencies["selectAuthority"];
  matchesCompiledAuthority: HostedPaymentRuntimeDependencies["matchesCompiledAuthority"];
  now: HostedPaymentRuntimeDependencies["now"];
  randomBytes: HostedPaymentRuntimeDependencies["randomBytes"];
}>;

export function resolveStorefrontHostedPaymentActivationMode(
  source: Environment,
  providerCode: HostedProviderCode = "paytr_iframe",
): StorefrontHostedPaymentActivationMode {
  const value = providerCode === "paytr_iframe"
    ? source.CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE
    : source.CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE;
  return value === "approved_test_sandbox"
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
    const candidate = approved as Readonly<PaymentProviderExecutionAuthority> | null;
    if (
      metadata === null
      || !exactCompiledAuthority("iyzico_iframe", candidate)
      || candidate.evidenceDigest !== metadata.candidateExecutionDigest
    ) return null;
    return Object.freeze({
      environment: candidate.environment,
      adapterVersion: candidate.adapterVersion,
      evidenceDigest: candidate.evidenceDigest,
    });
  } catch {
    return null;
  }
}

export function createDefaultStorefrontHostedPaymentCompiledAuthorities(
  iyzicoApproval: unknown = IYZICO_APPROVED_EXECUTION_AUTHORITY,
  iyzicoBuild: unknown = IYZICO_GENERATED_BUILD_METADATA,
): StorefrontHostedPaymentCompiledAuthorities {
  return Object.freeze({
    paytr_iframe: null,
    iyzico_iframe: resolveIyzicoCompiledExecutionAuthority(iyzicoApproval, iyzicoBuild),
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

function exactCompiledAuthority(
  providerCode: "paytr_iframe" | "iyzico_iframe",
  value: Readonly<PaymentProviderExecutionAuthority> | null,
): value is Readonly<PaymentProviderExecutionAuthority> {
  const packet = providerCode === "paytr_iframe" ? PAYTR_IFRAME_PACKET : IYZICO_IFRAME_PACKET;
  const descriptors = value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && !nodeTypes.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype
    ? Object.getOwnPropertyDescriptors(value)
    : null;
  const keys = ["environment", "adapterVersion", "evidenceDigest"];
  return descriptors !== null
    && Reflect.ownKeys(descriptors).length === keys.length
    && keys.every((key) => descriptors[key]?.enumerable === true && "value" in descriptors[key]!)
    && descriptors.environment?.value === "test"
    && descriptors.adapterVersion?.value === packet.adapterVersion
    && typeof descriptors.evidenceDigest?.value === "string"
    && /^sha256:[a-f0-9]{64}$/.test(descriptors.evidenceDigest.value);
}

function compiledAuthoritySnapshot(
  value: StorefrontHostedPaymentCompiledAuthorities,
): StorefrontHostedPaymentCompiledAuthorities | null {
  try {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || nodeTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = ["paytr_iframe", "iyzico_iframe"];
    if (
      Reflect.ownKeys(descriptors).length !== keys.length
      || !keys.every((key) => descriptors[key]?.enumerable === true && "value" in descriptors[key]!)
    ) return null;
    const paytr = descriptors.paytr_iframe!.value as Readonly<PaymentProviderExecutionAuthority> | null;
    const iyzico = descriptors.iyzico_iframe!.value as Readonly<PaymentProviderExecutionAuthority> | null;
    if (
      (paytr !== null && !exactCompiledAuthority("paytr_iframe", paytr))
      || (iyzico !== null && !exactCompiledAuthority("iyzico_iframe", iyzico))
    ) return null;
    return Object.freeze({
      paytr_iframe: paytr === null ? null : Object.freeze({
        environment: paytr.environment,
        adapterVersion: paytr.adapterVersion,
        evidenceDigest: paytr.evidenceDigest,
      }),
      iyzico_iframe: iyzico === null ? null : Object.freeze({
        environment: iyzico.environment,
        adapterVersion: iyzico.adapterVersion,
        evidenceDigest: iyzico.evidenceDigest,
      }),
    });
  } catch {
    return null;
  }
}

function executableInCurrentPacket(
  providerCode: "paytr_iframe" | "iyzico_iframe",
  authority: Readonly<PaymentProviderExecutionAuthority> | null,
): boolean {
  if (authority === null) return false;
  const packet = providerCode === "paytr_iframe" ? PAYTR_IFRAME_PACKET : IYZICO_IFRAME_PACKET;
  return authority.environment === "test"
    && authority.adapterVersion === packet.adapterVersion
    && (providerCode === "iyzico_iframe" || packet.readiness.test === "sandbox_ready");
}

export function createStorefrontHostedPaymentCompiledAuthoritySelector(
  value: StorefrontHostedPaymentCompiledAuthorities,
): StorefrontHostedPaymentCompiledAuthoritySelector | null {
  const authorities = compiledAuthoritySnapshot(value);
  if (authorities === null) return null;
  return Object.freeze((providerCode: string) => {
    if (providerCode !== "paytr_iframe" && providerCode !== "iyzico_iframe") return null;
    const authority = authorities[providerCode];
    return authority === null ? null : Object.freeze({ providerCode, ...authority });
  });
}

export function createDefaultHostedPaymentRuntime(input: Readonly<{
  source: Environment;
  compiledAuthorities: StorefrontHostedPaymentCompiledAuthorities;
  dependencies: ActiveDependencies;
}>): HostedPaymentRuntime | null {
  const authorities = compiledAuthoritySnapshot(input.compiledAuthorities);
  if (authorities === null) return null;
  const activeAuthorities = Object.freeze({
    paytr_iframe:
      resolveStorefrontHostedPaymentActivationMode(input.source, "paytr_iframe") === "approved_test_sandbox"
        ? authorities.paytr_iframe
        : null,
    iyzico_iframe:
      resolveStorefrontHostedPaymentActivationMode(input.source, "iyzico_iframe") === "approved_test_sandbox"
        ? authorities.iyzico_iframe
        : null,
  });
  const selectCompiledAuthority = createStorefrontHostedPaymentCompiledAuthoritySelector(activeAuthorities);
  if (
    selectCompiledAuthority === null
    || (!executableInCurrentPacket("paytr_iframe", activeAuthorities.paytr_iframe)
      && !executableInCurrentPacket("iyzico_iframe", activeAuthorities.iyzico_iframe))
  ) return null;
  const dependencies = input.dependencies;
  const adapters = createDefaultHostedPaymentAdapterRegistry(dependencies.transport);
  return createHostedPaymentRuntime({
    attempts: dependencies.attempts,
    adapters,
    keyring: dependencies.keyring,
    selectAuthority: dependencies.selectAuthority,
    selectCompiledAuthority: (providerCode) => {
      const authority = selectCompiledAuthority(providerCode);
      return authority !== null
        && executableInCurrentPacket(authority.providerCode, authority)
        ? authority
        : null;
    },
    matchesCompiledAuthority: dependencies.matchesCompiledAuthority,
    now: dependencies.now,
    randomBytes: dependencies.randomBytes,
  });
}
