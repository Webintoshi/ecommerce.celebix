import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export const DEFAULT_RUNTIME_IMPLEMENTED_GATEWAYS: string[] = [];
export const IYZICO_PRODUCTION_BASE_URL = "https://api.iyzipay.com";
export const IYZICO_SANDBOX_BASE_URL = "https://sandbox-api.iyzipay.com";
export const IYZICO_FAMILY_GATEWAYS = ["iyzico", "iyzico_iframe", "pay_with_iyzico"] as const;
export const PAYTR_FAMILY_GATEWAYS = ["paytr", "paytr_iframe"] as const;
export const PAYMENT_GATEWAY_FAMILIES = {
  paytr: PAYTR_FAMILY_GATEWAYS,
  iyzico: IYZICO_FAMILY_GATEWAYS,
};

export function getDefaultIyzicoBaseUrl(environment: string): string {
  return environment === "production" ? IYZICO_PRODUCTION_BASE_URL : IYZICO_SANDBOX_BASE_URL;
}

export function isGatewayInFamily(gateway: string, familyGateways: readonly string[]): boolean {
  return familyGateways.includes(gateway);
}

export function resolveIyzicoBaseUrl(
  baseUrl: string | undefined,
  environment: string
): string {
  return getDefaultIyzicoBaseUrl(environment);
}

const catalog = {
  registry: {},
  getPaymentProviderDefinition: () => null,
  createPaymentGatewayDefaults: () => ({}),
  normalizePaymentGatewayConfig: (x: any) => x,
  normalizePaymentGateways: (x: any) => x,
  sanitizePublicPaymentGateway: (x: any) => x,
  isRuntimeReadyPaymentGateway: () => false,
  getPaymentGatewayRuntimeStatus: () => ({ status: "unknown" as const }),
};

export const PAYMENT_PROVIDER_REGISTRY = catalog.registry;
export const getPaymentProviderDefinition = catalog.getPaymentProviderDefinition;
export const createPaymentGatewayDefaults = catalog.createPaymentGatewayDefaults;
export const normalizePaymentGatewayConfig = catalog.normalizePaymentGatewayConfig;
export const normalizePaymentGateways = catalog.normalizePaymentGateways;
export const sanitizePublicPaymentGateway = catalog.sanitizePublicPaymentGateway;
export const isRuntimeReadyPaymentGateway = catalog.isRuntimeReadyPaymentGateway;
export const getPaymentGatewayRuntimeStatus = catalog.getPaymentGatewayRuntimeStatus;
