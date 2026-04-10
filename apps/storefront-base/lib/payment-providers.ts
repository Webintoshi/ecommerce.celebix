import {
    CARD_TYPES,
    CashOnDeliveryConfig,
    PaymentEnvironment,
    PaymentBankAccountConfig,
    PaymentFieldDefinition,
    PaymentGateway,
    PaymentGatewayConfig,
    PaymentGatewayRuntimeStatus,
    PaymentProviderDefinition,
} from "@/types/payment";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

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

export const IYZICO_SANDBOX_BASE_URL = "https://sandbox-api.iyzipay.com";
export const IYZICO_PRODUCTION_BASE_URL = "https://api.iyzipay.com";

export function getDefaultIyzicoBaseUrl(environment: PaymentEnvironment) {
    return environment === "production" ? IYZICO_PRODUCTION_BASE_URL : IYZICO_SANDBOX_BASE_URL;
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

function buildFieldValueMap(fields: PaymentFieldDefinition[], source?: Record<string, unknown>) {
    return fields.reduce<Record<string, string>>((accumulator, field) => {
        const currentValue = source?.[field.key];
        if (typeof currentValue === "string") {
            accumulator[field.key] = currentValue.trim();
            return accumulator;
        }

        accumulator[field.key] = field.defaultValue ?? "";
        return accumulator;
    }, {});
}

export const PAYMENT_PROVIDER_REGISTRY: PaymentProviderDefinition[] = [
    {
        id: "paytr",
        name: "PAYTR",
        shortName: "PAYTR",
        description: "Sanal POS, link odeme ve 3D Secure akislari icin yaygin yerel odeme altyapisi.",
        category: "card_gateway",
        homepageUrl: "https://www.paytr.com",
        docsUrl: "https://www.paytr.com/entegrasyon",
        accentClassName: "from-red-600 to-rose-500",
        supportedMethods: ["credit_card", "debit_card", "installments", "link_payment"],
        supportedCardTypes: ["Visa", "MasterCard", "Troy"],
        defaultCurrency: "TRY",
        credentialFields: [
            { key: "merchantId", label: "Merchant ID", description: "PAYTR magaza numarasi.", placeholder: "123456", required: true },
            { key: "merchantKey", label: "Merchant Key", description: "PAYTR API key degeri.", placeholder: "merchant_key", required: true, secret: true, type: "password" },
            { key: "merchantSalt", label: "Merchant Salt", description: "Hash imzalari icin kullanilan salt.", placeholder: "merchant_salt", required: true, secret: true, type: "password" },
        ],
        configurationFields: [
            { key: "callbackUrl", label: "Callback URL", description: "Odeme sonucu donus adresi.", type: "url", placeholder: `${STOREFRONT_RUNTIME.siteUrl}/api/payments/paytr/callback` },
        ],
    },
    {
        id: "iyzico",
        name: "iyzico",
        shortName: "iyzico",
        description: "Kart, taksit ve pazar yeri odeme akislari icin yaygin yerel saglayici.",
        category: "card_gateway",
        homepageUrl: "https://www.iyzico.com",
        docsUrl: "https://docs.iyzico.com",
        accentClassName: "from-sky-600 to-blue-500",
        supportedMethods: ["credit_card", "debit_card", "installments", "bkm_express"],
        supportedCardTypes: ["Visa", "MasterCard", "Troy", "Amex"],
        defaultCurrency: "TRY",
        credentialFields: [
            { key: "apiKey", label: "API Key", description: "iyzico API anahtari.", placeholder: "sandbox-...", required: true, secret: true, type: "password" },
            { key: "secretKey", label: "Secret Key", description: "iyzico secret key.", placeholder: "secret-...", required: true, secret: true, type: "password" },
        ],
        configurationFields: [
            { key: "baseUrl", label: "Base URL", description: "API ortami URL degeri.", placeholder: IYZICO_SANDBOX_BASE_URL, defaultValue: IYZICO_SANDBOX_BASE_URL, type: "url" },
            { key: "subMerchantKey", label: "Sub Merchant Key", description: "Pazar yeri senaryosu varsa opsiyonel.", placeholder: "sub-merchant-key" },
        ],
    },
    {
        id: "paynet",
        name: "Paynet",
        shortName: "Paynet",
        description: "Ozellikle B2B tahsilat ve sanal POS senaryolarinda kullanilan yerel odeme platformu.",
        category: "card_gateway",
        homepageUrl: "https://www.paynet.com.tr",
        docsUrl: "https://www.paynet.com.tr",
        accentClassName: "from-indigo-600 to-violet-500",
        supportedMethods: ["credit_card", "debit_card", "link_payment"],
        supportedCardTypes: ["Visa", "MasterCard", "Troy"],
        defaultCurrency: "TRY",
        credentialFields: [
            { key: "merchantId", label: "Merchant ID", description: "Paynet bayi veya firma kimligi varsa opsiyonel olarak saklayin.", placeholder: "merchant-id" },
            { key: "apiKey", label: "Secret Key", description: "Paynet Basic Auth icin verilen secret key.", placeholder: "secret-key", required: true, secret: true, type: "password" },
        ],
        configurationFields: [
            { key: "agentId", label: "Agent ID", description: "Paynet agent kodu varsa girin.", placeholder: "agent-id" },
        ],
    },
    {
        id: "craftgate",
        name: "Craftgate",
        shortName: "Craftgate",
        description: "Birden fazla bankayi ve odeme saglayicisini tek katmanda orkestre eden odeme orkestrasyonu.",
        category: "orchestration",
        homepageUrl: "https://www.craftgate.io",
        docsUrl: "https://developer.craftgate.io",
        accentClassName: "from-violet-600 to-purple-500",
        supportedMethods: ["credit_card", "debit_card", "installments", "wallet", "link_payment"],
        supportedCardTypes: ["Visa", "MasterCard", "Troy", "Amex"],
        defaultCurrency: "TRY",
        credentialFields: [
            { key: "apiKey", label: "API Key", description: "Craftgate API key.", placeholder: "api-key", required: true, secret: true, type: "password" },
            { key: "secretKey", label: "Secret Key", description: "Craftgate secret key.", placeholder: "secret-key", required: true, secret: true, type: "password" },
        ],
        configurationFields: [
            { key: "baseUrl", label: "Base URL", description: "Craftgate API endpoint.", placeholder: "https://api.craftgate.io", defaultValue: "https://api.craftgate.io", type: "url" },
        ],
    },
    {
        id: "stripe",
        name: "Stripe",
        shortName: "Stripe",
        description: "Global satis ve yabanci kart kabul senaryolari icin opsiyonel global saglayici.",
        category: "card_gateway",
        homepageUrl: "https://stripe.com",
        docsUrl: "https://docs.stripe.com",
        accentClassName: "from-slate-700 to-slate-500",
        supportedMethods: ["credit_card", "debit_card", "wallet"],
        supportedCardTypes: CARD_TYPES,
        defaultCurrency: "USD",
        credentialFields: [
            { key: "publishableKey", label: "Publishable Key", description: "Stripe public key.", placeholder: "pk_live_...", required: true },
            { key: "secretKey", label: "Secret Key", description: "Stripe secret key.", placeholder: "sk_live_...", required: true, secret: true, type: "password" },
        ],
        configurationFields: [
            { key: "webhookSecret", label: "Webhook Secret", description: "Stripe webhook imza anahtari.", placeholder: "whsec_...", secret: true, type: "password", required: true },
        ],
    },
    {
        id: "bank_transfer",
        name: "Banka Havalesi / EFT",
        shortName: "Havale",
        description: "Banka hesabina manuel odeme kabul etmek icin kullanilir.",
        category: "bank_transfer",
        homepageUrl: STOREFRONT_RUNTIME.siteUrl,
        accentClassName: "from-green-600 to-emerald-500",
        supportedMethods: ["bank_transfer", "eft"],
        supportedCardTypes: [],
        defaultCurrency: "TRY",
        credentialFields: [],
        configurationFields: [
            { key: "paymentNote", label: "Odeme Notu", description: "Musteriye gosterilecek aciklama.", placeholder: "Siparis numarasini aciklama alanina yaziniz." },
        ],
    },
    {
        id: "cod",
        name: "Kapida Odeme",
        shortName: "Kapida",
        description: "Kargoda tahsilat veya teslimatta nakit odeme secenegi.",
        category: "cash_on_delivery",
        homepageUrl: STOREFRONT_RUNTIME.siteUrl,
        accentClassName: "from-amber-700 to-orange-500",
        supportedMethods: ["cash"],
        supportedCardTypes: [],
        defaultCurrency: "TRY",
        credentialFields: [],
        configurationFields: [
            { key: "extraFee", label: "Ek Ucret", description: "Kapida odeme servis bedeli.", placeholder: "0", type: "number", defaultValue: "0" },
        ],
    },
];

export function getPaymentProviderDefinition(gateway: PaymentGateway): PaymentProviderDefinition {
    const definition = PAYMENT_PROVIDER_REGISTRY.find((provider) => provider.id === gateway);

    if (!definition) {
        throw new Error(`Unknown payment gateway: ${gateway}`);
    }

    return definition;
}

function getProviderIcon(gateway: PaymentGateway): string {
    const icons: Record<PaymentGateway, string> = {
        paytr: "credit-card",
        iyzico: "building",
        paynet: "credit-card",
        craftgate: "layers",
        stripe: "globe",
        bank_transfer: "landmark",
        cod: "package",
    };

    return icons[gateway];
}

export function createPaymentGatewayDefaults(gateway: PaymentGateway): PaymentGatewayConfig {
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

function normalizeProviderSpecificConfiguration(
    gateway: PaymentGateway,
    environment: PaymentEnvironment,
    configuration: Record<string, string>,
) {
    if (gateway === "iyzico") {
        return {
            ...configuration,
            baseUrl: resolveIyzicoBaseUrl(configuration.baseUrl, environment),
        };
    }

    return configuration;
}

export function normalizePaymentGatewayConfig(raw: Record<string, unknown>): PaymentGatewayConfig {
    const gateway = raw.gateway as PaymentGateway;
    const base = createPaymentGatewayDefaults(gateway);
    const definition = getPaymentProviderDefinition(gateway);
    const environment = raw.environment === "production" ? "production" : "sandbox";

    const legacyCredentials: Record<string, unknown> = {
        merchantId: raw.merchantId,
        apiKey: raw.apiKey,
        apiSecret: raw.apiSecret,
        publicKey: raw.publicKey,
        clientId: raw.clientId,
        secretKey: raw.secretKey,
    };

    const configuration = normalizeProviderSpecificConfiguration(
        gateway,
        environment,
        buildFieldValueMap(
            definition.configurationFields,
            typeof raw.configuration === "object" && raw.configuration ? raw.configuration as Record<string, unknown> : {},
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
            ...(typeof raw.credentials === "object" && raw.credentials ? raw.credentials as Record<string, unknown> : {}),
        }),
        configuration,
        bankAccount: {
            ...base.bankAccount,
            ...(typeof raw.bankAccount === "object" && raw.bankAccount ? raw.bankAccount as PaymentBankAccountConfig : {}),
        },
        codSettings: {
            ...base.codSettings,
            ...(typeof raw.codSettings === "object" && raw.codSettings ? raw.codSettings as CashOnDeliveryConfig : {}),
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

export function normalizePaymentGateways(value: unknown): PaymentGatewayConfig[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && typeof item.gateway === "string"))
        .filter((item) => PAYMENT_PROVIDER_REGISTRY.some((provider) => provider.id === item.gateway))
        .map((item) => normalizePaymentGatewayConfig(item));
}

export function sanitizePublicPaymentGateway(gateway: PaymentGatewayConfig) {
    return {
        id: gateway.id,
        gateway: gateway.gateway,
        name: gateway.name,
        description: gateway.description,
        icon: gateway.icon,
        supportedMethods: gateway.supportedMethods,
        supportedCardTypes: gateway.supportedCardTypes,
        currency: gateway.currency,
        ...(gateway.gateway === "bank_transfer" ? {
            bankAccount: {
                bankName: gateway.bankAccount.bankName,
                iban: gateway.bankAccount.iban,
                accountHolder: gateway.bankAccount.accountHolder,
            },
        } : {}),
        ...(gateway.gateway === "cod" ? {
            codSettings: gateway.codSettings,
        } : {}),
    };
}

const RUNTIME_READY_GATEWAYS = new Set<PaymentGateway>([
    "paytr",
    "iyzico",
    "stripe",
    "paynet",
    "craftgate",
    "bank_transfer",
    "cod",
]);

export function isRuntimeReadyPaymentGateway(gateway: PaymentGateway) {
    return RUNTIME_READY_GATEWAYS.has(gateway);
}

export function getPaymentGatewayRuntimeStatus(gateway: PaymentGatewayConfig): PaymentGatewayRuntimeStatus {
    if (!isRuntimeReadyPaymentGateway(gateway.gateway)) {
        return {
            isReady: false,
            label: "Konfigurasyon Hazir",
            message: "API bilgileri kaydedilir ancak canli odeme icin payment init, callback/webhook ve runtime tablolarinin tamamlanmasi gerekir.",
        };
    }

    const definition = getPaymentProviderDefinition(gateway.gateway);
    const missingCredential = definition.credentialFields.find((field) => field.required && !gateway.credentials[field.key]?.trim());
    const missingConfiguration = definition.configurationFields.find((field) => field.required && !gateway.configuration[field.key]?.trim());

    if (gateway.gateway === "bank_transfer") {
        const hasBankInfo = gateway.bankAccount.bankName.trim() && gateway.bankAccount.iban.trim() && gateway.bankAccount.accountHolder.trim();

        if (!hasBankInfo) {
            return {
                isReady: false,
                label: "Eksik Bilgi",
                message: "Banka adi, IBAN ve hesap sahibi bilgileri olmadan havale yontemi checkout'ta kullanilamaz.",
            };
        }
    }

    if (missingCredential || missingConfiguration) {
        return {
            isReady: false,
            label: "Eksik Bilgi",
            message: "Zorunlu API veya saglayici alanlari tamamlanmadan bu odeme yontemi checkout'ta kullanilamaz.",
        };
    }

    return {
        isReady: true,
        label: "Canliya Hazir",
        message: "Bu odeme yontemi mevcut checkout akisinda kullanilabilir.",
    };
}
