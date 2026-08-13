import {
  EXECUTABLE_HOSTED_PAYMENT_PROVIDERS,
  parseProviderPaymentMethodConfig,
  type ExecutableHostedPaymentProvider,
  type MerchantPaymentMethod,
  type ProviderInstallmentMode,
  type ProviderMaxInstallment,
  type ProviderPaymentMethodLocale,
} from "@celebix/saas-contracts";

import type { SavePaymentMethodCommand } from "@/lib/payment-method-ui/client";

export type ProviderCheckoutPreferenceView = Readonly<{
  methodId: string;
  providerCode: ExecutableHostedPaymentProvider;
  providerLabel: "PayTR" | "iyzico";
  environment: "test" | "live";
  environmentLabel: "Test ortamı" | "Canlı ortam";
  locale: ProviderPaymentMethodLocale;
  threeDSecureLabel: "Sağlayıcı yönetir";
  installmentMode: ProviderInstallmentMode;
  maxInstallment: ProviderMaxInstallment;
}>;

export type ProviderCheckoutPreferenceSelection = Readonly<{
  locale: ProviderPaymentMethodLocale;
  installmentMode: ProviderInstallmentMode;
  maxInstallment: ProviderMaxInstallment;
}>;

export type ProviderCheckoutPreferenceSummary = Readonly<{
  label: string;
  environmentLabel: ProviderCheckoutPreferenceView["environmentLabel"];
}>;

function invalid(): never {
  throw new TypeError("provider_checkout_preferences_invalid");
}

function executableProvider(value: string | null): ExecutableHostedPaymentProvider {
  return value !== null
    && EXECUTABLE_HOSTED_PAYMENT_PROVIDERS.includes(value as ExecutableHostedPaymentProvider)
    ? value as ExecutableHostedPaymentProvider
    : invalid();
}

function exactProviderMethod(method: MerchantPaymentMethod): Readonly<{
  providerCode: ExecutableHostedPaymentProvider;
  config: ReturnType<typeof parseProviderPaymentMethodConfig>;
}> {
  if (method.kind !== "provider" || method.profileId === null) invalid();
  const providerCode = executableProvider(method.providerCode);
  try {
    return Object.freeze({
      providerCode,
      config: parseProviderPaymentMethodConfig(providerCode, method.config),
    });
  } catch {
    return invalid();
  }
}

export function buildProviderCheckoutPreferenceView(
  method: MerchantPaymentMethod,
): ProviderCheckoutPreferenceView {
  const selected = exactProviderMethod(method);
  return Object.freeze({
    methodId: method.id,
    providerCode: selected.providerCode,
    providerLabel: selected.providerCode === "paytr_iframe" ? "PayTR" : "iyzico",
    environment: selected.config.environment,
    environmentLabel: selected.config.environment === "test" ? "Test ortamı" : "Canlı ortam",
    locale: selected.config.locale,
    threeDSecureLabel: "Sağlayıcı yönetir",
    installmentMode: selected.config.installmentMode,
    maxInstallment: selected.config.maxInstallment,
  });
}

export function buildProviderCheckoutPreferenceSummary(
  method: MerchantPaymentMethod,
): ProviderCheckoutPreferenceSummary {
  const view = buildProviderCheckoutPreferenceView(method);
  const localeLabel = view.providerCode === "paytr_iframe"
    ? "Dil sağlayıcıda"
    : view.locale === "tr" ? "Türkçe" : "English";
  const installmentLabel = view.installmentMode === "single_payment"
    ? "Tek çekim"
    : view.installmentMode === "limited"
      ? `En fazla ${view.maxInstallment} taksit`
      : "Tüm uygun taksitler";
  return Object.freeze({
    label: `${localeLabel} · ${installmentLabel} · 3D sağlayıcıda`,
    environmentLabel: view.environmentLabel,
  });
}

export function buildProviderCheckoutPreferenceCommand(
  method: MerchantPaymentMethod,
  selection: ProviderCheckoutPreferenceSelection,
): SavePaymentMethodCommand {
  const current = exactProviderMethod(method);
  const maxInstallment = selection.installmentMode === "limited"
    ? selection.maxInstallment
    : 0;
  let config: ReturnType<typeof parseProviderPaymentMethodConfig>;
  try {
    config = parseProviderPaymentMethodConfig(current.providerCode, {
      environment: current.config.environment,
      locale: selection.locale,
      threeDSecure: "provider_managed",
      installmentMode: selection.installmentMode,
      maxInstallment,
    });
  } catch {
    return invalid();
  }
  return Object.freeze({
    methodId: method.id,
    expectedVersion: method.version,
    kind: "provider",
    profileId: method.profileId,
    providerCode: current.providerCode,
    label: method.label,
    config,
  });
}
