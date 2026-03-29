import { z } from "zod";
import type {
  MarketplaceProvider,
  MarketplaceProviderAdapter,
  MarketplaceProviderDefinition,
  MarketplaceProviderCredentials,
} from "@/types/marketplace";
import { createTrendyolAdapter } from "@/lib/marketplace/adapters/trendyol";
import { createHepsiburadaAdapter } from "@/lib/marketplace/adapters/hepsiburada";
import { createN11Adapter } from "@/lib/marketplace/adapters/n11";
import { createAmazonTrAdapter } from "@/lib/marketplace/adapters/amazon-tr";
import {
  TrendyolLogo,
  HepsiburadaLogo,
  N11Logo,
  AmazonTrLogo,
} from "@/components/marketplace/marketplace-logos";

export const MARKETPLACE_PROVIDER_DEFINITIONS: MarketplaceProviderDefinition[] = [
  {
    id: "trendyol",
    name: "Trendyol",
    description: "Trendyol satici paneli icin katalog, stok ve siparis orkestrasyonu.",
    websiteUrl: "https://partner.trendyol.com",
    docsUrl: "https://developers.trendyol.com",
    logo: "TY",
    logoComponent: TrendyolLogo,
    color: "from-orange-500 to-red-600",
    supportsWebhook: true,
    credentialFields: [
      { key: "sellerId", label: "Seller ID", required: true },
      { key: "apiKey", label: "API Key", required: true, type: "password" },
      { key: "apiSecret", label: "API Secret", required: true, type: "password" },
      { key: "webhookApiKey", label: "Webhook API Key", required: false, type: "password" },
      { key: "webhookSecret", label: "Webhook Secret", required: false, type: "password" },
    ],
    mappingFields: [
      { key: "defaultCargoCompany", label: "Varsayilan kargo firmasi" },
      { key: "warehouseCode", label: "Depo kodu" },
      { key: "baseUrl", label: "API Base URL", placeholder: "https://api.trendyol.com/sapigw" },
    ],
    capabilities: ["listing", "inventory", "orders", "status", "webhook"],
  },
  {
    id: "hepsiburada",
    name: "Hepsiburada",
    description: "Hepsiburada merchant entegrasyonu icin operasyon paneli.",
    websiteUrl: "https://merchant.hepsiburada.com",
    docsUrl: "https://developers.hepsiburada.com",
    logo: "HB",
    logoComponent: HepsiburadaLogo,
    color: "from-blue-500 to-indigo-600",
    supportsWebhook: true,
    credentialFields: [
      { key: "merchantId", label: "Merchant ID", required: true },
      { key: "integrationUsername", label: "Entegrator kullanici adi", required: true },
      { key: "serviceKey", label: "Service Key", required: true, type: "password" },
      { key: "webhookUsername", label: "Webhook kullanici adi", required: false },
      { key: "webhookPassword", label: "Webhook sifresi", required: false, type: "password" },
    ],
    mappingFields: [
      { key: "shipmentTemplate", label: "Shipment template" },
      { key: "warehouseCode", label: "Depo kodu" },
      { key: "listingBaseUrl", label: "Listing API URL", placeholder: "https://listing-external.hepsiburada.com" },
      { key: "orderBaseUrl", label: "Order API URL", placeholder: "https://oms-external.hepsiburada.com" },
    ],
    capabilities: ["listing", "inventory", "orders", "status", "webhook"],
  },
  {
    id: "n11",
    name: "N11",
    description: "N11 katalog, fiyat, stok ve siparis akislari icin entegrasyon katmani.",
    websiteUrl: "https://seller.n11.com",
    docsUrl: "https://api.n11.com",
    logo: "N11",
    logoComponent: N11Logo,
    color: "from-purple-500 to-pink-600",
    supportsWebhook: false,
    credentialFields: [
      { key: "appKey", label: "App Key", required: true, type: "password" },
      { key: "appSecret", label: "App Secret", required: true, type: "password" },
    ],
    mappingFields: [
      { key: "sellerCode", label: "Satici kodu" },
      { key: "shipmentCompany", label: "Kargo firmasi" },
      { key: "baseUrl", label: "API Base URL", placeholder: "https://api.n11.com" },
    ],
    capabilities: ["listing", "inventory", "orders", "status", "polling"],
  },
  {
    id: "amazon_tr",
    name: "Amazon TR",
    description: "Amazon Selling Partner API tabanli Turkiye entegrasyonu.",
    websiteUrl: "https://sellercentral.amazon.com.tr",
    docsUrl: "https://developer-docs.amazon.com/sp-api",
    logo: "AMZ",
    logoComponent: AmazonTrLogo,
    color: "from-slate-700 to-black",
    supportsWebhook: false,
    credentialFields: [
      { key: "clientId", label: "LWA Client ID", required: true },
      { key: "clientSecret", label: "LWA Client Secret", required: true, type: "password" },
      { key: "refreshToken", label: "Refresh Token", required: true, type: "password" },
      { key: "sellerId", label: "Seller ID", required: true },
      { key: "marketplaceId", label: "Marketplace ID", placeholder: "A33AVAJ2PDY3EV" },
    ],
    mappingFields: [
      { key: "fulfillmentLatency", label: "Hazirlama suresi" },
      { key: "merchantShippingGroup", label: "Shipping group" },
      { key: "baseUrl", label: "API Base URL", placeholder: "https://sellingpartnerapi-eu.amazon.com" },
    ],
    capabilities: ["listing", "inventory", "orders", "status", "polling"],
  },
];

const providerIdSet = new Set<string>(MARKETPLACE_PROVIDER_DEFINITIONS.map((provider) => provider.id));

const trendyolCredentialsSchema = z.object({
  sellerId: z.string().trim().min(1, "sellerId zorunludur."),
  apiKey: z.string().trim().min(1, "apiKey zorunludur."),
  apiSecret: z.string().trim().min(1, "apiSecret zorunludur."),
  webhookApiKey: z.string().trim().optional().or(z.literal("")),
  webhookSecret: z.string().trim().optional().or(z.literal("")),
  webhookUsername: z.string().trim().optional().or(z.literal("")),
  webhookPassword: z.string().trim().optional().or(z.literal("")),
});

const hepsiburadaCredentialsSchema = z.object({
  merchantId: z.string().trim().min(1, "merchantId zorunludur."),
  integrationUsername: z.string().trim().min(1, "integrationUsername zorunludur."),
  serviceKey: z.string().trim().min(1, "serviceKey zorunludur."),
  webhookUsername: z.string().trim().optional().or(z.literal("")),
  webhookPassword: z.string().trim().optional().or(z.literal("")),
});

const n11CredentialsSchema = z.object({
  appKey: z.string().trim().min(1, "appKey zorunludur."),
  appSecret: z.string().trim().min(1, "appSecret zorunludur."),
});

const amazonCredentialsSchema = z.object({
  clientId: z.string().trim().min(1, "clientId zorunludur."),
  clientSecret: z.string().trim().min(1, "clientSecret zorunludur."),
  refreshToken: z.string().trim().min(1, "refreshToken zorunludur."),
  sellerId: z.string().trim().min(1, "sellerId zorunludur."),
  marketplaceId: z.string().trim().optional().or(z.literal("")),
});

export const MARKETPLACE_CREDENTIAL_SCHEMAS = {
  trendyol: trendyolCredentialsSchema,
  hepsiburada: hepsiburadaCredentialsSchema,
  n11: n11CredentialsSchema,
  amazon_tr: amazonCredentialsSchema,
} as const;

type CredentialSchemaMap = typeof MARKETPLACE_CREDENTIAL_SCHEMAS;

export function parseMarketplaceCredentials<P extends MarketplaceProvider>(
  provider: P,
  credentials: unknown,
): {
  success: true;
  credentials: MarketplaceProviderCredentials<P>;
} | {
  success: false;
  error: z.ZodError;
} {
  const schema = MARKETPLACE_CREDENTIAL_SCHEMAS[provider] as CredentialSchemaMap[P];
  const parsed = schema.safeParse(credentials || {});
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error,
    };
  }

  return {
    success: true,
    credentials: parsed.data as MarketplaceProviderCredentials<P>,
  };
}

const ADAPTERS: Record<MarketplaceProvider, MarketplaceProviderAdapter> = {
  trendyol: createTrendyolAdapter(),
  hepsiburada: createHepsiburadaAdapter(),
  n11: createN11Adapter(),
  amazon_tr: createAmazonTrAdapter(),
};

export function isMarketplaceProvider(value: string): value is MarketplaceProvider {
  return providerIdSet.has(value);
}

export function getMarketplaceProviderDefinition(provider: MarketplaceProvider) {
  return MARKETPLACE_PROVIDER_DEFINITIONS.find((item) => item.id === provider) || null;
}

export function getMarketplaceProviderAdapter(provider: MarketplaceProvider) {
  return ADAPTERS[provider];
}
