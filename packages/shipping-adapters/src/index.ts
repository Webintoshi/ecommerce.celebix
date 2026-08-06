export { createShippingProviderTransport } from "./transport.ts";
export { resolveShippingProviderAdapter } from "./registry.ts";
export { BASIT_KARGO_API_ORIGIN } from "./validation.ts";
export type {
  CancelProviderShipmentInput,
  CreateProviderShipmentInput,
  CreateProviderShipmentResult,
  CreateReturnShipmentInput,
  DownloadShippingLabelInput,
  GetProviderShipmentInput,
  GetProviderShipmentResult,
  ProviderShipment,
  ProviderShipmentItemInput,
  ProviderShipmentMutationResult,
  ProviderShipmentRecipientInput,
  ProviderShippingHandler,
  ProviderShippingQuote,
  ProviderShippingResource,
  QuoteShippingPackagesInput,
  ShippingCredentialResourceInput,
  ShippingCredentialVerification,
  ShippingHandlerListResult,
  ShippingLabelDownloadResult,
  ShippingProviderAdapter,
  ShippingProviderMutationFailure,
  ShippingProviderReadFailure,
  ShippingQuoteResult,
  ShippingResourceListResult,
  VerifyShippingCredentialInput,
} from "./contracts.ts";
export type {
  ShippingProviderFetch,
  ShippingProviderTransport,
  ShippingProviderTransportRequest,
  ShippingProviderTransportResult,
} from "./transport.ts";
