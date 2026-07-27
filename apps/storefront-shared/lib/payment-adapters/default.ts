import "server-only";

import {
  PAYTR_IFRAME_PACKET,
  createPaymentAdapterRegistry,
  createPaytrIframeAdapter,
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

type ActiveDependencies = Readonly<{
  attempts: PaymentAttemptRepository;
  keyring: MerchantProviderCredentialKeyring;
  transport: ProviderTransport;
  selectAuthority: HostedPaymentRuntimeDependencies["selectAuthority"];
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

function exactCompiledAuthority(
  value: Readonly<PaymentProviderExecutionAuthority> | null,
): value is Readonly<PaymentProviderExecutionAuthority> {
  return value !== null
    && value.environment === "test"
    && value.adapterVersion === PAYTR_IFRAME_PACKET.adapterVersion
    && /^sha256:[a-f0-9]{64}$/.test(value.evidenceDigest);
}

export function createDefaultHostedPaymentRuntime(input: Readonly<{
  source: Environment;
  compiledAuthority: Readonly<PaymentProviderExecutionAuthority> | null;
  dependencies: ActiveDependencies;
}>): HostedPaymentRuntime | null {
  if (
    resolveStorefrontHostedPaymentActivationMode(input.source) !== "approved_test_sandbox"
    || !exactCompiledAuthority(input.compiledAuthority)
    || PAYTR_IFRAME_PACKET.readiness.test !== "sandbox_ready"
  ) return null;
  const dependencies = input.dependencies;
  const adapter = createPaytrIframeAdapter(dependencies.transport);
  const adapters = createPaymentAdapterRegistry([PAYTR_IFRAME_PACKET], [adapter]);
  return createHostedPaymentRuntime({
    attempts: dependencies.attempts,
    adapters,
    keyring: dependencies.keyring,
    selectAuthority: dependencies.selectAuthority,
    now: dependencies.now,
    randomBytes: dependencies.randomBytes,
  });
}
