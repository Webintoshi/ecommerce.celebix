export type PaymentGateway =
    | "paytr"
    | "iyzico"
    | "paynet"
    | "craftgate"
    | "stripe"
    | "bank_transfer"
    | "cod";

export type PaymentMethodStatus = "active" | "inactive" | "test";

export type PaymentEnvironment = "sandbox" | "production";

export type PaymentProviderCategory =
    | "card_gateway"
    | "orchestration"
    | "link_checkout"
    | "bank_transfer"
    | "cash_on_delivery";

export type PaymentFieldType = "text" | "password" | "email" | "url" | "number" | "select";

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
    homepageUrl: string;
    docsUrl?: string;
    accentClassName: string;
    supportedMethods: string[];
    supportedCardTypes: string[];
    defaultCurrency: string;
    credentialFields: PaymentFieldDefinition[];
    configurationFields: PaymentFieldDefinition[];
}

export interface PaymentGatewayRuntimeStatus {
    isReady: boolean;
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
