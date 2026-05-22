export type PaymentGateway =
  | "paytr"
  | "paytr_iframe"
  | "iyzico"
  | "iyzico_iframe"
  | "pay_with_iyzico"
  | "paynet"
  | "craftgate"
  | "stripe"
  | "garanti"
  | "garanti_pay"
  | "finansbank"
  | "ziraatpay"
  | "ziraat_katilim"
  | "ziraat"
  | "yapi_kredi"
  | "esnekpos"
  | "param"
  | "paratika"
  | "qnbpay"
  | "lidio"
  | "moka"
  | "hepsipay"
  | "bank_transfer"
  | "cod";

export type PaymentMethodStatus = "active" | "inactive" | "test";

export type PaymentEnvironment = "sandbox" | "production";

export type PaymentProviderCategory =
  | "card_gateway"
  | "bank_virtual_pos"
  | "orchestration"
  | "wallet_checkout"
  | "link_checkout"
  | "bank_transfer"
  | "cash_on_delivery";

export type PaymentFieldType = "text" | "password" | "email" | "url" | "number" | "select";

export type PaymentIntegrationFamily =
  | "paytr"
  | "iyzico"
  | "garanti_virtual_pos"
  | "est_v3"
  | "payten"
  | "posnet"
  | "pay_smart"
  | "param"
  | "esnekpos"
  | "lidio"
  | "moka"
  | "hepsipay"
  | "craftgate"
  | "paynet"
  | "stripe"
  | "manual";

export type PaymentImplementationStatus = "live" | "catalog_only";

export interface PaymentFieldOption {
  label: string;
  value: string;
}

export interface PaymentFieldDefinition {
  key: string;
  label: string;
  description: string;
  placeholder?: string;
  type?: PaymentFieldType;
  required?: boolean;
  secret?: boolean;
  defaultValue?: string;
  options?: PaymentFieldOption[];
}

export interface PaymentBankAccountConfig {
  bankName: string;
  iban: string;
  accountHolder: string;
  swift: string;
  currency: string;
}

export interface CashOnDeliveryConfig {
  minOrderAmount: number;
  maxOrderAmount: number;
  applicableRegions: string[];
  instructions: string;
}

export interface PaymentProviderDefinition {
  id: PaymentGateway;
  name: string;
  shortName: string;
  description: string;
  category: PaymentProviderCategory;
  integrationFamily: PaymentIntegrationFamily;
  implementationStatus: PaymentImplementationStatus;
  homepageUrl?: string;
  docsUrl?: string;
  accentClassName: string;
  checkoutExperience: "redirect" | "iframe" | "hosted_form" | "manual";
  supportedMethods: string[];
  supportedCardTypes: string[];
  defaultCurrency: string;
  supportsThreeDS: boolean;
  supportsInstallments: boolean;
  supportsRefund: boolean;
  supportsSavedCard: boolean;
  supportsConnectionTest: boolean;
  credentialFields: PaymentFieldDefinition[];
  configurationFields: PaymentFieldDefinition[];
}

export interface PaymentGatewayRuntimeStatus {
  isReady: boolean;
  code: "live_ready" | "missing_fields" | "manual_missing_bank_info" | "catalog_only";
  label: string;
  message: string;
}

export interface PaymentGatewayConfig {
  id: string;
  gateway: PaymentGateway;
  name: string;
  description: string;
  icon: string;
  status: PaymentMethodStatus;
  environment: PaymentEnvironment;
  credentials: Record<string, string>;
  configuration: Record<string, string>;
  bankAccount: PaymentBankAccountConfig;
  codSettings: CashOnDeliveryConfig;
  supportedCardTypes: string[];
  supportedMethods: string[];
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentGatewayFormState = PaymentGatewayConfig;

export type PaymentAttemptStatus =
  | "initiated"
  | "pending_action"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded";

export interface PaymentAttempt {
  id: string;
  order_id: string;
  gateway_id: string;
  provider: string;
  status: PaymentAttemptStatus;
  amount: number;
  currency: string;
  idempotency_key: string;
  checkout_token?: string | null;
  redirect_url?: string | null;
  provider_payment_id?: string | null;
  provider_reference_id?: string | null;
  conversation_id?: string | null;
  customer_email?: string | null;
  customer_ip?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  callback_payload: Record<string, unknown>;
  callback_received_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentWebhookEvent {
  id: string;
  provider: string;
  gateway_id?: string | null;
  payment_attempt_id?: string | null;
  order_id?: string | null;
  event_type?: string | null;
  status: string;
  signature?: string | null;
  headers: Record<string, unknown>;
  payload: Record<string, unknown>;
  error_message?: string | null;
  processed_at?: string | null;
  created_at: string;
}

export interface PaymentInitResult {
  action: "redirect" | "success" | "pending";
  redirectUrl?: string;
  message?: string;
  paymentAttemptId: string;
}

export interface PaymentProviderCatalogOptions {
  storefrontUrl: string;
  implementedGateways?: readonly PaymentGateway[];
}

export const PAYTR_FAMILY_GATEWAYS = ["paytr", "paytr_iframe"] as const satisfies readonly PaymentGateway[];
export const IYZICO_FAMILY_GATEWAYS = ["iyzico", "iyzico_iframe", "pay_with_iyzico"] as const satisfies readonly PaymentGateway[];
export const GARANTI_FAMILY_GATEWAYS = ["garanti", "garanti_pay"] as const satisfies readonly PaymentGateway[];
export const EST_V3_FAMILY_GATEWAYS = ["finansbank", "ziraat", "ziraat_katilim"] as const satisfies readonly PaymentGateway[];
export const PAYTEN_FAMILY_GATEWAYS = ["ziraatpay", "paratika"] as const satisfies readonly PaymentGateway[];
export const POSNET_FAMILY_GATEWAYS = ["yapi_kredi"] as const satisfies readonly PaymentGateway[];
export const PAY_SMART_FAMILY_GATEWAYS = ["qnbpay"] as const satisfies readonly PaymentGateway[];

export const PAYMENT_GATEWAY_FAMILIES = {
  paytr: PAYTR_FAMILY_GATEWAYS,
  iyzico: IYZICO_FAMILY_GATEWAYS,
  garanti_virtual_pos: GARANTI_FAMILY_GATEWAYS,
  est_v3: EST_V3_FAMILY_GATEWAYS,
  payten: PAYTEN_FAMILY_GATEWAYS,
  posnet: POSNET_FAMILY_GATEWAYS,
  pay_smart: PAY_SMART_FAMILY_GATEWAYS,
} as const;

export const PAYMENT_METHOD_STATUSES = [
  { value: "active", label: "Aktif", color: "bg-green-100 text-green-700" },
  { value: "inactive", label: "Pasif", color: "bg-red-100 text-red-700" },
  { value: "test", label: "Test Modu", color: "bg-yellow-100 text-yellow-700" },
] as const;

export const PAYMENT_ENVIRONMENTS = [
  { value: "sandbox", label: "Test Ortami", description: "Gelistirme ve test icin" },
  { value: "production", label: "Canli Ortam", description: "Gercek islemler icin" },
] as const;

export const CARD_TYPES = ["Visa", "MasterCard", "Troy", "Amex", "Diners Club", "JCB", "Discover"];

export const CURRENCIES = [
  { value: "TRY", label: "Turk Lirasi", symbol: "TL" },
  { value: "USD", label: "US Dollar", symbol: "$" },
  { value: "EUR", label: "Euro", symbol: "EUR" },
  { value: "GBP", label: "British Pound", symbol: "GBP" },
];

export const IYZICO_SANDBOX_BASE_URL = "https://sandbox-api.iyzipay.com";
export const IYZICO_PRODUCTION_BASE_URL = "https://api.iyzipay.com";

export const DEFAULT_RUNTIME_IMPLEMENTED_GATEWAYS = [
  "paytr",
  "paytr_iframe",
  "iyzico",
  "iyzico_iframe",
  "pay_with_iyzico",
  "paynet",
  "craftgate",
  "stripe",
  "bank_transfer",
  "cod",
] as const satisfies readonly PaymentGateway[];

export const DEFAULT_STORE_PAYMENT_GATEWAYS = [
  "paytr",
  "paytr_iframe",
  "iyzico",
  "iyzico_iframe",
  "pay_with_iyzico",
  "garanti",
  "garanti_pay",
  "finansbank",
  "ziraatpay",
  "ziraat_katilim",
  "ziraat",
  "yapi_kredi",
  "esnekpos",
  "param",
  "paratika",
  "qnbpay",
  "lidio",
  "moka",
  "hepsipay",
  "craftgate",
  "paynet",
  "stripe",
  "bank_transfer",
  "cod",
] as const satisfies readonly PaymentGateway[];

const DEFAULT_BANK_ACCOUNT: PaymentBankAccountConfig = {
  bankName: "",
  iban: "",
  accountHolder: "",
  swift: "",
  currency: "TRY",
};

const DEFAULT_COD_SETTINGS: CashOnDeliveryConfig = {
  minOrderAmount: 0,
  maxOrderAmount: 10000,
  applicableRegions: ["TURKIYE"],
  instructions: "",
};

function buildSeededPaymentGatewayId(gateway: PaymentGateway) {
  return `seed-${gateway}`;
}

function resolveSeededGatewayConfiguration(
  gateway: PaymentGateway,
  storefrontUrl: string,
  configuration: Record<string, string>,
) {
  if (isGatewayInFamily(gateway, PAYTR_FAMILY_GATEWAYS)) {
    return {
      ...configuration,
      callbackUrl: configuration.callbackUrl || `${stripTrailingSlash(storefrontUrl)}/api/payments/paytr/callback`,
    };
  }

  return configuration;
}

interface StorePaymentGatewaySeedOptions {
  storefrontUrl: string;
  existingGateways?: PaymentGatewayConfig[];
  gateways?: readonly PaymentGateway[];
  implementedGateways?: readonly PaymentGateway[];
  now?: string;
}

const THREED_TYPE_OPTIONS: PaymentFieldOption[] = [
  { value: "3D_PAY", label: "3D Pay" },
  { value: "3D_FULL", label: "3D Full" },
  { value: "3D_HOSTING", label: "3D Hosting" },
];

const SYNC_MODE_OPTIONS: PaymentFieldOption[] = [
  { value: "0", label: "Asenkron Callback" },
  { value: "1", label: "Senkron Donus" },
];

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function field(definition: PaymentFieldDefinition): PaymentFieldDefinition {
  return definition;
}

function buildFieldValueMap(fields: PaymentFieldDefinition[], source?: Record<string, unknown>) {
  return fields.reduce<Record<string, string>>((accumulator, currentField) => {
    const currentValue = source?.[currentField.key];
    if (typeof currentValue === "string") {
      accumulator[currentField.key] = currentValue.trim();
      return accumulator;
    }

    accumulator[currentField.key] = currentField.defaultValue ?? "";
    return accumulator;
  }, {});
}

function createImplementationSet(implementedGateways?: readonly PaymentGateway[]) {
  return new Set<PaymentGateway>(implementedGateways ?? DEFAULT_RUNTIME_IMPLEMENTED_GATEWAYS);
}

function toImplementationStatus(gateway: PaymentGateway, implementedGateways: Set<PaymentGateway>): PaymentImplementationStatus {
  return implementedGateways.has(gateway) ? "live" : "catalog_only";
}

function createProvider(
  implementedGateways: Set<PaymentGateway>,
  definition: Omit<PaymentProviderDefinition, "implementationStatus" | "supportsConnectionTest"> & {
    supportsConnectionTest?: boolean;
  },
): PaymentProviderDefinition {
  const implementationStatus = toImplementationStatus(definition.id, implementedGateways);

  return {
    ...definition,
    implementationStatus,
    supportsConnectionTest: implementationStatus === "live" && (definition.supportsConnectionTest ?? true),
  };
}

const PAYTR_CREDENTIAL_FIELDS = [
  field({ key: "merchantId", label: "Merchant ID", description: "PAYTR magaza numarasi.", placeholder: "123456", required: true }),
  field({ key: "merchantKey", label: "Merchant Key", description: "PAYTR API key degeri.", placeholder: "merchant_key", required: true, secret: true, type: "password" }),
  field({ key: "merchantSalt", label: "Merchant Salt", description: "Hash imzalari icin kullanilan salt.", placeholder: "merchant_salt", required: true, secret: true, type: "password" }),
];

const IYZICO_CREDENTIAL_FIELDS = [
  field({ key: "apiKey", label: "API Key", description: "iyzico API anahtari.", placeholder: "sandbox-...", required: true, secret: true, type: "password" }),
  field({ key: "secretKey", label: "Secret Key", description: "iyzico secret key.", placeholder: "secret-...", required: true, secret: true, type: "password" }),
];

const EST_V3_CREDENTIAL_FIELDS = [
  field({ key: "merchantId", label: "Merchant ID", description: "Sanal POS isyeri numarasi.", required: true }),
  field({ key: "merchantUser", label: "Merchant User", description: "Sanal POS kullanici adi.", required: true }),
  field({ key: "merchantPassword", label: "Merchant Password", description: "Sanal POS sifresi.", required: true, secret: true, type: "password" }),
  field({ key: "storeKey", label: "3D Store Key", description: "3D guvenlik anahtari.", required: true, secret: true, type: "password" }),
];

const POSNET_CREDENTIAL_FIELDS = [
  field({ key: "merchantId", label: "Merchant ID", description: "Posnet isyeri numarasi.", required: true }),
  field({ key: "terminalId", label: "Terminal ID", description: "Terminal numarasi.", required: true }),
  field({ key: "posnetId", label: "Posnet ID", description: "Posnet islem numarasi.", required: true }),
  field({ key: "storeKey", label: "3D Store Key", description: "3D store key.", required: true, secret: true, type: "password" }),
];

const PAYTEN_CREDENTIAL_FIELDS = [
  field({ key: "merchant", label: "Merchant", description: "Payten merchant kodu.", required: true }),
  field({ key: "merchantUser", label: "Merchant User", description: "Payten kullanici adi.", required: true }),
  field({ key: "merchantPassword", label: "Merchant Password", description: "Payten sifresi.", required: true, secret: true, type: "password" }),
];

const PAY_SMART_CREDENTIAL_FIELDS = [
  field({ key: "appKey", label: "App Key", description: "Pay Smart app key.", required: true, secret: true, type: "password" }),
  field({ key: "appSecret", label: "App Secret", description: "Pay Smart app secret.", required: true, secret: true, type: "password" }),
  field({ key: "merchantKey", label: "Merchant Key", description: "Merchant key.", required: true, secret: true, type: "password" }),
  field({ key: "merchantId", label: "Merchant ID", description: "Merchant ID.", required: true }),
];

const GARANTI_CREDENTIAL_FIELDS = [
  field({ key: "merchantId", label: "Merchant ID", description: "Garanti magaza numarasi.", required: true }),
  field({ key: "merchantUser", label: "Merchant User", description: "Garanti musteri numarasi.", required: true }),
  field({ key: "merchantPassword", label: "Merchant Password", description: "Garanti sifresi.", required: true, secret: true, type: "password" }),
  field({ key: "terminalId", label: "Terminal ID", description: "Garanti terminal numarasi.", required: true }),
  field({ key: "storeKey", label: "3D Store Key", description: "3D store key.", required: true, secret: true, type: "password" }),
  field({ key: "refundUser", label: "Refund User", description: "Iade kullanicisi varsa girin." }),
  field({ key: "refundPassword", label: "Refund Password", description: "Iade sifresi varsa girin.", secret: true, type: "password" }),
];

const GARANTI_PAY_CREDENTIAL_FIELDS = [
  field({ key: "merchantKValue", label: "Merchant K Value", description: "GarantiPay Merchant K degeri.", required: true, secret: true, type: "password" }),
  field({ key: "merchantKidValue", label: "Merchant KID Value", description: "GarantiPay Merchant KID degeri.", required: true, secret: true, type: "password" }),
];

const ESNEKPOS_CREDENTIAL_FIELDS = [
  field({ key: "merchant", label: "Merchant", description: "EsnekPos merchant bilgisi.", required: true }),
  field({ key: "merchantKey", label: "Merchant Key", description: "EsnekPos merchant key.", required: true, secret: true, type: "password" }),
];

const PARAM_CREDENTIAL_FIELDS = [
  field({ key: "clientCode", label: "Client Code", description: "PARAM client code.", required: true }),
  field({ key: "clientUsername", label: "Client Username", description: "PARAM client username.", required: true }),
  field({ key: "clientPassword", label: "Client Password", description: "PARAM client password.", required: true, secret: true, type: "password" }),
  field({ key: "guid", label: "GUID", description: "PARAM GUID degeri.", required: true, secret: true, type: "password" }),
];

const LIDIO_CREDENTIAL_FIELDS = [
  field({ key: "merchantCode", label: "Merchant Code", description: "Lidio musteri islem ID.", required: true }),
  field({ key: "authorization", label: "Authorization", description: "Lidio authorization bilgisi.", required: true, secret: true, type: "password" }),
  field({ key: "merchantKey", label: "Merchant Key", description: "Lidio merchant key.", required: true, secret: true, type: "password" }),
  field({ key: "apiPassword", label: "API Password", description: "Lidio API sifresi.", required: true, secret: true, type: "password" }),
];

const MOKA_CREDENTIAL_FIELDS = [
  field({ key: "apiStoreCode", label: "API Store Code", description: "Moka bayi kodu.", required: true }),
  field({ key: "apiUsername", label: "API Username", description: "Moka API kullanici adi.", required: true }),
  field({ key: "apiPassword", label: "API Password", description: "Moka API sifresi.", required: true, secret: true, type: "password" }),
];

const HEPSIPAY_CREDENTIAL_FIELDS = [
  field({ key: "merchantNo", label: "Merchant No", description: "Hepsipay magaza numarasi.", required: true }),
  field({ key: "terminalNo", label: "Terminal No", description: "Hepsipay terminal numarasi.", required: true }),
  field({ key: "storeKey", label: "Store Key", description: "Hepsipay store key.", required: true, secret: true, type: "password" }),
];

export function getDefaultIyzicoBaseUrl(environment: PaymentEnvironment) {
  return environment === "production" ? IYZICO_PRODUCTION_BASE_URL : IYZICO_SANDBOX_BASE_URL;
}

export function isGatewayInFamily(gateway: PaymentGateway, familyGateways: readonly PaymentGateway[]) {
  return familyGateways.includes(gateway);
}

export function resolveIyzicoBaseUrl(baseUrl: string | undefined, environment: PaymentEnvironment) {
  const normalized = typeof baseUrl === "string" ? baseUrl.trim() : "";

  if (!normalized) {
    return getDefaultIyzicoBaseUrl(environment);
  }

  if (normalized === IYZICO_SANDBOX_BASE_URL || normalized === IYZICO_PRODUCTION_BASE_URL) {
    return getDefaultIyzicoBaseUrl(environment);
  }

  return normalized;
}

function getProviderIcon(gateway: PaymentGateway): string {
  switch (gateway) {
    case "craftgate":
      return "layers";
    case "stripe":
      return "globe";
    case "iyzico":
    case "iyzico_iframe":
    case "pay_with_iyzico":
      return "building";
    case "bank_transfer":
      return "landmark";
    case "cod":
      return "package";
    default:
      return "credit-card";
  }
}

function normalizeProviderSpecificConfiguration(
  gateway: PaymentGateway,
  environment: PaymentEnvironment,
  configuration: Record<string, string>,
) {
  if (gateway === "iyzico" || gateway === "iyzico_iframe" || gateway === "pay_with_iyzico") {
    return {
      ...configuration,
      baseUrl: resolveIyzicoBaseUrl(configuration.baseUrl, environment),
    };
  }

  return configuration;
}

export function createPaymentProviderCatalog(options: PaymentProviderCatalogOptions) {
  const implementedGateways = createImplementationSet(options.implementedGateways);
  const storefrontUrl = stripTrailingSlash(options.storefrontUrl);
  const paytrConfigurationFields = [
    field({ key: "callbackUrl", label: "Callback URL", description: "Saglayici paneline kaydedilecek callback adresi.", type: "url", placeholder: `${storefrontUrl}/api/payments/paytr/callback` }),
    field({ key: "syncMode", label: "Sync Mode", description: "PAYTR senkron donus modu.", type: "select", defaultValue: "0", options: SYNC_MODE_OPTIONS }),
  ];
  const iyzicoConfigurationFields = [
    field({ key: "baseUrl", label: "Base URL", description: "API ortami URL degeri.", placeholder: IYZICO_SANDBOX_BASE_URL, defaultValue: IYZICO_SANDBOX_BASE_URL, type: "url" }),
    field({ key: "subMerchantKey", label: "Sub Merchant Key", description: "Pazar yeri senaryosu varsa opsiyonel.", placeholder: "sub-merchant-key" }),
  ];
  const estV3ConfigurationFields = [
    field({ key: "threedType", label: "3D Type", description: "3D guvenlik akisi.", type: "select", defaultValue: "3D_PAY", options: THREED_TYPE_OPTIONS }),
    field({ key: "department", label: "Department", description: "Banka alt isyeri veya department bilgisi varsa girin." }),
  ];
  const garantiConfigurationFields = [
    field({ key: "threedType", label: "3D Type", description: "3D guvenlik akisi.", type: "select", defaultValue: "3D_PAY", options: THREED_TYPE_OPTIONS }),
  ];

  const registry: PaymentProviderDefinition[] = [
    createProvider(implementedGateways, {
      id: "paytr",
      name: "PAYTR",
      shortName: "PAYTR",
      description: "Yerel kart odemeleri icin redirect checkout akisi.",
      category: "card_gateway",
      integrationFamily: "paytr",
      homepageUrl: "https://www.paytr.com",
      docsUrl: "https://www.paytr.com/entegrasyon",
      accentClassName: "from-red-600 to-rose-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments", "link_payment"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: PAYTR_CREDENTIAL_FIELDS,
      configurationFields: paytrConfigurationFields,
    }),
    createProvider(implementedGateways, {
      id: "paytr_iframe",
      name: "PAYTR IFrame",
      shortName: "PAYTR IFrame",
      description: "PAYTR iframe tabanli hosted checkout akisi.",
      category: "link_checkout",
      integrationFamily: "paytr",
      accentClassName: "from-rose-600 to-orange-500",
      checkoutExperience: "iframe",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: PAYTR_CREDENTIAL_FIELDS,
      configurationFields: paytrConfigurationFields,
    }),
    createProvider(implementedGateways, {
      id: "iyzico",
      name: "iyzico",
      shortName: "iyzico",
      description: "iyzico checkout form akisi.",
      category: "card_gateway",
      integrationFamily: "iyzico",
      homepageUrl: "https://www.iyzico.com",
      docsUrl: "https://docs.iyzico.com",
      accentClassName: "from-sky-600 to-blue-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments", "bkm_express"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy", "Amex"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: IYZICO_CREDENTIAL_FIELDS,
      configurationFields: iyzicoConfigurationFields,
    }),
    createProvider(implementedGateways, {
      id: "iyzico_iframe",
      name: "iyzico IFrame",
      shortName: "iyzico IFrame",
      description: "iyzico iframe tabanli checkout form akisi.",
      category: "link_checkout",
      integrationFamily: "iyzico",
      accentClassName: "from-cyan-600 to-sky-500",
      checkoutExperience: "iframe",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy", "Amex"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: IYZICO_CREDENTIAL_FIELDS,
      configurationFields: iyzicoConfigurationFields,
    }),
    createProvider(implementedGateways, {
      id: "pay_with_iyzico",
      name: "Pay with iyzico",
      shortName: "Pay with iyzico",
      description: "iyzico cuzdan/hosted checkout varyanti.",
      category: "wallet_checkout",
      integrationFamily: "iyzico",
      accentClassName: "from-blue-700 to-sky-500",
      checkoutExperience: "hosted_form",
      supportedMethods: ["wallet", "credit_card", "debit_card"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy", "Amex"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: false,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: IYZICO_CREDENTIAL_FIELDS,
      configurationFields: iyzicoConfigurationFields,
    }),
    createProvider(implementedGateways, {
      id: "craftgate",
      name: "Craftgate",
      shortName: "Craftgate",
      description: "Birden fazla odeme kanalini orkestre eden odeme katmani.",
      category: "orchestration",
      integrationFamily: "craftgate",
      homepageUrl: "https://www.craftgate.io",
      docsUrl: "https://developer.craftgate.io",
      accentClassName: "from-violet-600 to-purple-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments", "wallet", "link_payment"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy", "Amex"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: [
        field({ key: "apiKey", label: "API Key", description: "Craftgate API key.", placeholder: "api-key", required: true, secret: true, type: "password" }),
        field({ key: "secretKey", label: "Secret Key", description: "Craftgate secret key.", placeholder: "secret-key", required: true, secret: true, type: "password" }),
      ],
      configurationFields: [
        field({ key: "baseUrl", label: "Base URL", description: "Craftgate API endpoint.", placeholder: "https://api.craftgate.io", defaultValue: "https://api.craftgate.io", type: "url" }),
      ],
    }),
    createProvider(implementedGateways, {
      id: "paynet",
      name: "Paynet",
      shortName: "Paynet",
      description: "Ozellikle B2B tahsilat ve mail order link odeme senaryolari.",
      category: "card_gateway",
      integrationFamily: "paynet",
      homepageUrl: "https://www.paynet.com.tr",
      accentClassName: "from-indigo-600 to-violet-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "link_payment"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: false,
      supportsInstallments: false,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: [
        field({ key: "merchantId", label: "Merchant ID", description: "Paynet bayi veya firma kimligi varsa opsiyonel olarak saklayin.", placeholder: "merchant-id" }),
        field({ key: "apiKey", label: "Secret Key", description: "Paynet Basic Auth icin verilen secret key.", placeholder: "secret-key", required: true, secret: true, type: "password" }),
      ],
      configurationFields: [
        field({ key: "agentId", label: "Agent ID", description: "Paynet agent kodu varsa girin.", placeholder: "agent-id" }),
      ],
    }),
    createProvider(implementedGateways, {
      id: "stripe",
      name: "Stripe",
      shortName: "Stripe",
      description: "Global kart ve wallet odemeleri icin opsiyonel kanal.",
      category: "card_gateway",
      integrationFamily: "stripe",
      homepageUrl: "https://stripe.com",
      docsUrl: "https://docs.stripe.com",
      accentClassName: "from-slate-700 to-slate-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "wallet"],
      supportedCardTypes: CARD_TYPES,
      defaultCurrency: "USD",
      supportsThreeDS: true,
      supportsInstallments: false,
      supportsRefund: true,
      supportsSavedCard: true,
      credentialFields: [
        field({ key: "publishableKey", label: "Publishable Key", description: "Stripe public key.", placeholder: "pk_live_...", required: true }),
        field({ key: "secretKey", label: "Secret Key", description: "Stripe secret key.", placeholder: "sk_live_...", required: true, secret: true, type: "password" }),
      ],
      configurationFields: [
        field({ key: "webhookSecret", label: "Webhook Secret", description: "Stripe webhook imza anahtari.", placeholder: "whsec_...", secret: true, type: "password", required: true }),
      ],
    }),
    createProvider(implementedGateways, {
      id: "garanti",
      name: "Garanti BBVA",
      shortName: "Garanti",
      description: "Garanti Sanal POS ve 3D Secure akisi.",
      category: "bank_virtual_pos",
      integrationFamily: "garanti_virtual_pos",
      accentClassName: "from-emerald-600 to-teal-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: GARANTI_CREDENTIAL_FIELDS,
      configurationFields: garantiConfigurationFields,
    }),
    createProvider(implementedGateways, {
      id: "garanti_pay",
      name: "GarantiPay",
      shortName: "GarantiPay",
      description: "GarantiPay hosted checkout akisi.",
      category: "wallet_checkout",
      integrationFamily: "garanti_virtual_pos",
      accentClassName: "from-teal-600 to-emerald-500",
      checkoutExperience: "hosted_form",
      supportedMethods: ["wallet", "credit_card"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: false,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: GARANTI_PAY_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "finansbank",
      name: "Finansbank",
      shortName: "Finansbank",
      description: "QNB Finansbank sanal POS, EST V3 ailesi.",
      category: "bank_virtual_pos",
      integrationFamily: "est_v3",
      accentClassName: "from-fuchsia-600 to-pink-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: EST_V3_CREDENTIAL_FIELDS,
      configurationFields: estV3ConfigurationFields,
    }),
    createProvider(implementedGateways, {
      id: "ziraat",
      name: "Ziraat Bankasi",
      shortName: "Ziraat",
      description: "Ziraat sanal POS, EST V3 ailesi.",
      category: "bank_virtual_pos",
      integrationFamily: "est_v3",
      accentClassName: "from-rose-700 to-red-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: EST_V3_CREDENTIAL_FIELDS,
      configurationFields: estV3ConfigurationFields,
    }),
    createProvider(implementedGateways, {
      id: "ziraat_katilim",
      name: "Ziraat Katilim",
      shortName: "Ziraat Katilim",
      description: "Ziraat Katilim sanal POS, EST V3 ailesi.",
      category: "bank_virtual_pos",
      integrationFamily: "est_v3",
      accentClassName: "from-red-700 to-rose-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: EST_V3_CREDENTIAL_FIELDS,
      configurationFields: estV3ConfigurationFields,
    }),
    createProvider(implementedGateways, {
      id: "yapi_kredi",
      name: "Yapi Kredi",
      shortName: "Yapi Kredi",
      description: "Yapi Kredi Posnet tabanli sanal POS.",
      category: "bank_virtual_pos",
      integrationFamily: "posnet",
      accentClassName: "from-blue-700 to-indigo-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: POSNET_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "ziraatpay",
      name: "ZiraatPay",
      shortName: "ZiraatPay",
      description: "Payten tabanli ZiraatPay akisi.",
      category: "card_gateway",
      integrationFamily: "payten",
      accentClassName: "from-rose-600 to-orange-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: false,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: PAYTEN_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "esnekpos",
      name: "EsnekPos",
      shortName: "EsnekPos",
      description: "Merchant ve merchant key ile calisan yerel checkout API.",
      category: "card_gateway",
      integrationFamily: "esnekpos",
      accentClassName: "from-cyan-700 to-blue-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: ESNEKPOS_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "param",
      name: "PARAM",
      shortName: "PARAM",
      description: "PARAM API tabanli sanal POS akisi.",
      category: "card_gateway",
      integrationFamily: "param",
      accentClassName: "from-slate-700 to-sky-600",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: PARAM_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "paratika",
      name: "Paratika",
      shortName: "Paratika",
      description: "Payten tabanli Paratika entegrasyonu.",
      category: "card_gateway",
      integrationFamily: "payten",
      accentClassName: "from-violet-700 to-fuchsia-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: PAYTEN_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "qnbpay",
      name: "QNBpay",
      shortName: "QNBpay",
      description: "Pay Smart ailesi ile calisan QNBpay entegrasyonu.",
      category: "card_gateway",
      integrationFamily: "pay_smart",
      accentClassName: "from-purple-700 to-indigo-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: PAY_SMART_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "lidio",
      name: "Lidio",
      shortName: "Lidio",
      description: "Lidio checkout API entegrasyonu.",
      category: "orchestration",
      integrationFamily: "lidio",
      accentClassName: "from-indigo-700 to-slate-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments", "wallet"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy", "Amex"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: LIDIO_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "moka",
      name: "Moka",
      shortName: "Moka",
      description: "Moka API tabanli kart odeme akisi.",
      category: "card_gateway",
      integrationFamily: "moka",
      accentClassName: "from-sky-700 to-cyan-500",
      checkoutExperience: "redirect",
      supportedMethods: ["credit_card", "debit_card", "installments"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: true,
      supportsRefund: true,
      supportsSavedCard: false,
      credentialFields: MOKA_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "hepsipay",
      name: "Hepsipay",
      shortName: "Hepsipay",
      description: "Hepsipay checkout entegrasyonu.",
      category: "wallet_checkout",
      integrationFamily: "hepsipay",
      accentClassName: "from-orange-600 to-amber-500",
      checkoutExperience: "hosted_form",
      supportedMethods: ["wallet", "credit_card", "debit_card"],
      supportedCardTypes: ["Visa", "MasterCard", "Troy"],
      defaultCurrency: "TRY",
      supportsThreeDS: true,
      supportsInstallments: false,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: HEPSIPAY_CREDENTIAL_FIELDS,
      configurationFields: [],
    }),
    createProvider(implementedGateways, {
      id: "bank_transfer",
      name: "Banka Havalesi / EFT",
      shortName: "Havale",
      description: "Banka hesabina manuel odeme kabul etmek icin kullanilir.",
      category: "bank_transfer",
      integrationFamily: "manual",
      homepageUrl: storefrontUrl,
      accentClassName: "from-green-600 to-emerald-500",
      checkoutExperience: "manual",
      supportedMethods: ["bank_transfer", "eft"],
      supportedCardTypes: [],
      defaultCurrency: "TRY",
      supportsThreeDS: false,
      supportsInstallments: false,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: [],
      configurationFields: [
        field({ key: "paymentNote", label: "Odeme Notu", description: "Musteriye gosterilecek aciklama.", placeholder: "Siparis numarasini aciklama alanina yaziniz." }),
      ],
      supportsConnectionTest: true,
    }),
    createProvider(implementedGateways, {
      id: "cod",
      name: "Kapida Odeme",
      shortName: "Kapida",
      description: "Teslimatta nakit veya kartla tahsilat secenegi.",
      category: "cash_on_delivery",
      integrationFamily: "manual",
      homepageUrl: storefrontUrl,
      accentClassName: "from-amber-700 to-orange-500",
      checkoutExperience: "manual",
      supportedMethods: ["cash"],
      supportedCardTypes: [],
      defaultCurrency: "TRY",
      supportsThreeDS: false,
      supportsInstallments: false,
      supportsRefund: false,
      supportsSavedCard: false,
      credentialFields: [],
      configurationFields: [
        field({ key: "extraFee", label: "Ek Ucret", description: "Kapida odeme servis bedeli.", placeholder: "0", type: "number", defaultValue: "0" }),
      ],
      supportsConnectionTest: true,
    }),
  ];

  const registryById = new Map(registry.map((provider) => [provider.id, provider]));

  function getPaymentProviderDefinition(gateway: PaymentGateway): PaymentProviderDefinition {
    const definition = registryById.get(gateway);

    if (!definition) {
      throw new Error(`Unknown payment gateway: ${gateway}`);
    }

    return definition;
  }

  function createPaymentGatewayDefaults(gateway: PaymentGateway): PaymentGatewayConfig {
    const definition = getPaymentProviderDefinition(gateway);
    const now = new Date().toISOString();

    return {
      id: `pg-${Date.now()}-${gateway}`,
      gateway,
      name: definition.name,
      description: definition.description,
      icon: getProviderIcon(gateway),
      status: "inactive",
      environment: gateway === "bank_transfer" || gateway === "cod" ? "production" : "sandbox",
      credentials: buildFieldValueMap(definition.credentialFields),
      configuration: buildFieldValueMap(definition.configurationFields),
      bankAccount: { ...DEFAULT_BANK_ACCOUNT, currency: definition.defaultCurrency },
      codSettings: { ...DEFAULT_COD_SETTINGS },
      supportedCardTypes: [...definition.supportedCardTypes],
      supportedMethods: [...definition.supportedMethods],
      currency: definition.defaultCurrency,
      createdAt: now,
      updatedAt: now,
    };
  }

  function normalizePaymentGatewayConfig(raw: Record<string, unknown>): PaymentGatewayConfig {
    const gateway = raw.gateway as PaymentGateway;
    const base = createPaymentGatewayDefaults(gateway);
    const definition = getPaymentProviderDefinition(gateway);
    const environment = raw.environment === "production" ? "production" : "sandbox";

    const legacyCredentials: Record<string, unknown> = {
      merchantId: raw.merchantId ?? raw.merchant_id,
      merchantUser: raw.merchantUser ?? raw.merchant_user,
      merchantPassword: raw.merchantPassword ?? raw.merchant_password,
      terminalId: raw.terminalId ?? raw.terminal_id,
      storeKey: raw.storeKey ?? raw.merchant_threed_store_key,
      threedType: raw.threedType ?? raw.merchant_threed_type,
      department: raw.department ?? raw.merchant_department,
      refundUser: raw.refundUser ?? raw.refund_user,
      refundPassword: raw.refundPassword ?? raw.refund_password,
      posnetId: raw.posnetId ?? raw.posnet_id,
      merchant: raw.merchant,
      merchantKey: raw.merchantKey ?? raw.merchant_key,
      merchantSalt: raw.merchantSalt ?? raw.merchant_salt,
      apiKey: raw.apiKey ?? raw.api_key,
      secretKey: raw.secretKey ?? raw.apiSecret ?? raw.api_secret,
      appKey: raw.appKey ?? raw.app_key,
      appSecret: raw.appSecret ?? raw.app_secret,
      clientCode: raw.clientCode ?? raw.client_code,
      clientUsername: raw.clientUsername ?? raw.client_username,
      clientPassword: raw.clientPassword ?? raw.client_password,
      guid: raw.guid,
      merchantCode: raw.merchantCode ?? raw.merchant_code,
      authorization: raw.authorization,
      apiPassword: raw.apiPassword ?? raw.api_password,
      apiStoreCode: raw.apiStoreCode ?? raw.api_store_code,
      apiUsername: raw.apiUsername ?? raw.api_username,
      merchantNo: raw.merchantNo ?? raw.merchant_no,
      terminalNo: raw.terminalNo ?? raw.terminal_no,
      merchantKValue: raw.merchantKValue ?? raw.merchant_k_value,
      merchantKidValue: raw.merchantKidValue ?? raw.merchant_kid_value,
      publishableKey: raw.publishableKey ?? raw.publishable_key,
      webhookSecret: raw.webhookSecret ?? raw.webhook_secret,
      subMerchantKey: raw.subMerchantKey ?? raw.sub_merchant_key,
      baseUrl: raw.baseUrl ?? raw.base_url,
    };

    const configuration = normalizeProviderSpecificConfiguration(
      gateway,
      environment,
      buildFieldValueMap(
        definition.configurationFields,
        typeof raw.configuration === "object" && raw.configuration ? (raw.configuration as Record<string, unknown>) : {},
      ),
    );

    return {
      ...base,
      id: typeof raw.id === "string" ? raw.id : base.id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name : base.name,
      description: typeof raw.description === "string" ? raw.description : base.description,
      icon: typeof raw.icon === "string" && raw.icon.trim() ? raw.icon : base.icon,
      status: raw.status === "active" || raw.status === "test" ? raw.status : "inactive",
      environment,
      credentials: buildFieldValueMap(definition.credentialFields, {
        ...legacyCredentials,
        ...(typeof raw.credentials === "object" && raw.credentials ? (raw.credentials as Record<string, unknown>) : {}),
      }),
      configuration,
      bankAccount: {
        ...base.bankAccount,
        ...(typeof raw.bankAccount === "object" && raw.bankAccount ? (raw.bankAccount as PaymentBankAccountConfig) : {}),
      },
      codSettings: {
        ...base.codSettings,
        ...(typeof raw.codSettings === "object" && raw.codSettings ? (raw.codSettings as CashOnDeliveryConfig) : {}),
      },
      supportedCardTypes: Array.isArray(raw.supportedCardTypes)
        ? raw.supportedCardTypes.filter((value): value is string => typeof value === "string")
        : base.supportedCardTypes,
      supportedMethods: Array.isArray(raw.supportedMethods)
        ? raw.supportedMethods.filter((value): value is string => typeof value === "string")
        : base.supportedMethods,
      currency: typeof raw.currency === "string" ? raw.currency : base.currency,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : base.createdAt,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
    };
  }

  function normalizePaymentGateways(value: unknown): PaymentGatewayConfig[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && typeof item.gateway === "string"))
      .filter((item) => registryById.has(item.gateway as PaymentGateway))
      .map((item) => normalizePaymentGatewayConfig(item));
  }

  function sanitizePublicPaymentGateway(gateway: PaymentGatewayConfig) {
    return {
      id: gateway.id,
      gateway: gateway.gateway,
      name: gateway.name,
      description: gateway.description,
      icon: gateway.icon,
      supportedMethods: gateway.supportedMethods,
      supportedCardTypes: gateway.supportedCardTypes,
      currency: gateway.currency,
      ...(gateway.gateway === "bank_transfer"
        ? {
            bankAccount: {
              bankName: gateway.bankAccount.bankName,
              iban: gateway.bankAccount.iban,
              accountHolder: gateway.bankAccount.accountHolder,
            },
          }
        : {}),
      ...(gateway.gateway === "cod" ? { codSettings: gateway.codSettings } : {}),
    };
  }

  function isRuntimeReadyPaymentGateway(gateway: PaymentGateway) {
    return getPaymentProviderDefinition(gateway).implementationStatus === "live";
  }

  function getPaymentGatewayRuntimeStatus(gateway: PaymentGatewayConfig): PaymentGatewayRuntimeStatus {
    const definition = getPaymentProviderDefinition(gateway.gateway);

    if (definition.implementationStatus !== "live") {
      return {
        isReady: false,
        code: "catalog_only",
        label: "Adapter Bekliyor",
        message: "Bu saglayici GurmePOS referansi ile kataloga eklendi. Admin konfigurasyonu hazir ama checkout runtime adapteri henuz tamamlanmadi.",
      };
    }

    const missingCredential = definition.credentialFields.find((currentField) => currentField.required && !gateway.credentials[currentField.key]?.trim());
    const missingConfiguration = definition.configurationFields.find((currentField) => currentField.required && !gateway.configuration[currentField.key]?.trim());

    if (gateway.gateway === "bank_transfer") {
      const hasBankInfo = gateway.bankAccount.bankName.trim() && gateway.bankAccount.iban.trim() && gateway.bankAccount.accountHolder.trim();

      if (!hasBankInfo) {
        return {
          isReady: false,
          code: "manual_missing_bank_info",
          label: "Eksik Bilgi",
          message: "Banka adi, IBAN ve hesap sahibi bilgileri olmadan havale yontemi checkoutta kullanilamaz.",
        };
      }
    }

    if (missingCredential || missingConfiguration) {
      return {
        isReady: false,
        code: "missing_fields",
        label: "Eksik Bilgi",
        message: "Zorunlu API veya saglayici alanlari tamamlanmadan bu odeme yontemi checkoutta kullanilamaz.",
      };
    }

    return {
      isReady: true,
      code: "live_ready",
      label: "Canliya Hazir",
      message: "Bu odeme yontemi mevcut checkout akisinda kullanilabilir.",
    };
  }

  return {
    registry,
    getPaymentProviderDefinition,
    createPaymentGatewayDefaults,
    normalizePaymentGatewayConfig,
    normalizePaymentGateways,
    sanitizePublicPaymentGateway,
    isRuntimeReadyPaymentGateway,
    getPaymentGatewayRuntimeStatus,
  };
}

export function createDefaultStorePaymentGateways(options: StorePaymentGatewaySeedOptions): PaymentGatewayConfig[] {
  const catalog = createPaymentProviderCatalog({
    storefrontUrl: options.storefrontUrl,
    implementedGateways: options.implementedGateways,
  });
  const timestamp = options.now ?? new Date().toISOString();

  return (options.gateways ?? DEFAULT_STORE_PAYMENT_GATEWAYS).map((gateway) => {
    const seededGateway = catalog.createPaymentGatewayDefaults(gateway);

    return {
      ...seededGateway,
      id: buildSeededPaymentGatewayId(gateway),
      configuration: resolveSeededGatewayConfiguration(
        gateway,
        options.storefrontUrl,
        seededGateway.configuration,
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

export function mergeStorePaymentGatewaysWithDefaults(options: StorePaymentGatewaySeedOptions): PaymentGatewayConfig[] {
  const existingGateways = options.existingGateways ?? [];
  const existingGatewayIds = new Set(existingGateways.map((gateway) => gateway.gateway));
  const defaultGateways = createDefaultStorePaymentGateways(options);

  return [
    ...existingGateways,
    ...defaultGateways.filter((gateway) => !existingGatewayIds.has(gateway.gateway)),
  ];
}
