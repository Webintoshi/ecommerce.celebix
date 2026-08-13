import type { PaymentProviderEnvironment } from "./types.ts";

export const EXECUTABLE_HOSTED_PAYMENT_PROVIDERS = Object.freeze([
  "paytr_iframe",
  "iyzico_iframe",
] as const);

export type ExecutableHostedPaymentProvider =
  (typeof EXECUTABLE_HOSTED_PAYMENT_PROVIDERS)[number];

export const PROVIDER_PAYMENT_METHOD_LOCALES = Object.freeze(["tr", "en"] as const);
export type ProviderPaymentMethodLocale = (typeof PROVIDER_PAYMENT_METHOD_LOCALES)[number];

export const PROVIDER_INSTALLMENT_MODES = Object.freeze([
  "all",
  "single_payment",
  "limited",
] as const);
export type ProviderInstallmentMode = (typeof PROVIDER_INSTALLMENT_MODES)[number];

export const PROVIDER_MAX_INSTALLMENTS = Object.freeze([0, 2, 3, 6, 9, 12] as const);
export type ProviderMaxInstallment = (typeof PROVIDER_MAX_INSTALLMENTS)[number];

export type ProviderPaymentMethodConfig = Readonly<{
  environment: PaymentProviderEnvironment;
  locale: ProviderPaymentMethodLocale;
  threeDSecure: "provider_managed";
  installmentMode: ProviderInstallmentMode;
  maxInstallment: ProviderMaxInstallment;
}>;

const REQUIRED_KEYS = Object.freeze([
  "environment",
  "installmentMode",
  "locale",
  "maxInstallment",
  "threeDSecure",
] as const);

function invalid(): never {
  throw new TypeError("provider_payment_method_config_invalid");
}

function provider(value: unknown): ExecutableHostedPaymentProvider {
  return typeof value === "string"
    && EXECUTABLE_HOSTED_PAYMENT_PROVIDERS.includes(value as ExecutableHostedPaymentProvider)
    ? value as ExecutableHostedPaymentProvider
    : invalid();
}

function exactRecord(value: unknown): Readonly<Record<string, unknown>> {
  try {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== REQUIRED_KEYS.length
      || keys.some((key) => typeof key !== "string" || !REQUIRED_KEYS.includes(key as never))
      || REQUIRED_KEYS.some((key) => !Object.hasOwn(descriptors, key))
    ) invalid();
    const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") invalid();
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
      selected[key] = descriptor.value;
    }
    return selected;
  } catch (error) {
    if (error instanceof TypeError && error.message === "provider_payment_method_config_invalid") throw error;
    return invalid();
  }
}

export function parseProviderPaymentMethodConfig(
  providerCode: ExecutableHostedPaymentProvider,
  value: unknown,
): ProviderPaymentMethodConfig {
  provider(providerCode);
  const selected = exactRecord(value);
  const environment = selected.environment;
  const locale = selected.locale;
  const installmentMode = selected.installmentMode;
  const maxInstallment = selected.maxInstallment;
  if (
    (environment !== "test" && environment !== "live")
    || !PROVIDER_PAYMENT_METHOD_LOCALES.includes(locale as ProviderPaymentMethodLocale)
    || (providerCode === "paytr_iframe" && locale !== "tr")
    || selected.threeDSecure !== "provider_managed"
    || !PROVIDER_INSTALLMENT_MODES.includes(installmentMode as ProviderInstallmentMode)
    || !PROVIDER_MAX_INSTALLMENTS.includes(maxInstallment as ProviderMaxInstallment)
    || (installmentMode === "limited" ? maxInstallment === 0 : maxInstallment !== 0)
  ) invalid();
  return Object.freeze({
    environment,
    locale: locale as ProviderPaymentMethodLocale,
    threeDSecure: "provider_managed" as const,
    installmentMode: installmentMode as ProviderInstallmentMode,
    maxInstallment: maxInstallment as ProviderMaxInstallment,
  });
}

export function defaultProviderPaymentMethodConfig(
  providerCode: ExecutableHostedPaymentProvider,
  environment: PaymentProviderEnvironment,
): ProviderPaymentMethodConfig {
  provider(providerCode);
  if (environment !== "test" && environment !== "live") invalid();
  return Object.freeze({
    environment,
    locale: "tr",
    threeDSecure: "provider_managed",
    installmentMode: "all",
    maxInstallment: 0,
  });
}
