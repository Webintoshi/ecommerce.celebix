import {
  createPaymentProviderCatalog,
  DEFAULT_RUNTIME_IMPLEMENTED_GATEWAYS,
  getDefaultIyzicoBaseUrl,
  IYZICO_PRODUCTION_BASE_URL,
  IYZICO_SANDBOX_BASE_URL,
  IYZICO_FAMILY_GATEWAYS,
  isGatewayInFamily,
  PAYMENT_GATEWAY_FAMILIES,
  PAYTR_FAMILY_GATEWAYS,
  resolveIyzicoBaseUrl,
} from "@celebix/payment-core";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

const catalog = createPaymentProviderCatalog({
  storefrontUrl: STOREFRONT_RUNTIME.siteUrl,
  implementedGateways: DEFAULT_RUNTIME_IMPLEMENTED_GATEWAYS,
});

export const PAYMENT_PROVIDER_REGISTRY = catalog.registry;
export const getPaymentProviderDefinition = catalog.getPaymentProviderDefinition;
export const createPaymentGatewayDefaults = catalog.createPaymentGatewayDefaults;
export const normalizePaymentGatewayConfig = catalog.normalizePaymentGatewayConfig;
export const normalizePaymentGateways = catalog.normalizePaymentGateways;
export const sanitizePublicPaymentGateway = catalog.sanitizePublicPaymentGateway;
export const isRuntimeReadyPaymentGateway = catalog.isRuntimeReadyPaymentGateway;
export const getPaymentGatewayRuntimeStatus = catalog.getPaymentGatewayRuntimeStatus;

export {
  DEFAULT_RUNTIME_IMPLEMENTED_GATEWAYS,
  getDefaultIyzicoBaseUrl,
  IYZICO_PRODUCTION_BASE_URL,
  IYZICO_SANDBOX_BASE_URL,
  IYZICO_FAMILY_GATEWAYS,
  isGatewayInFamily,
  PAYMENT_GATEWAY_FAMILIES,
  PAYTR_FAMILY_GATEWAYS,
  resolveIyzicoBaseUrl,
};
