import "server-only";
import { types as nodeTypes } from "node:util";

import {
  IYZICO_IFRAME_PACKET,
  PAYTR_IFRAME_PACKET,
  createIyzicoCheckoutFormAdapter,
  createPaymentAdapterRegistry,
  createPaytrIframeAdapter,
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
): StorefrontHostedPaymentActivationMode {
  return source.CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE === "approved_test_sandbox"
    ? "approved_test_sandbox"
    : "disabled";
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
  return packet.readiness[authority.environment] === "sandbox_ready";
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
  if (resolveStorefrontHostedPaymentActivationMode(input.source) !== "approved_test_sandbox") return null;
  const authorities = compiledAuthoritySnapshot(input.compiledAuthorities);
  const selectCompiledAuthority = createStorefrontHostedPaymentCompiledAuthoritySelector(
    input.compiledAuthorities,
  );
  if (
    authorities === null
    || selectCompiledAuthority === null
    || (!executableInCurrentPacket("paytr_iframe", authorities.paytr_iframe)
      && !executableInCurrentPacket("iyzico_iframe", authorities.iyzico_iframe))
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
