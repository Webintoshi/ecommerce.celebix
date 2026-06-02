import {
    ShippingIntegrationFieldDefinition,
    ShippingIntegrationProvider,
    ShippingIntegrationRecord,
    ShippingIntegrationSettings,
    ShippingProviderDefinition,
} from "@/types/shipping-integration";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

const DEFAULT_AUTOMATION = {
    autoCreateShipment: false,
    autoSyncTracking: true,
    orderTrigger: "preparing" as const,
};

export const SHIPPING_PROVIDER_REGISTRY: ShippingProviderDefinition[] = [
    {
        id: "basit-kargo",
        name: "Basit Kargo",
        shortName: "Basit",
        description: "Tek bearer token ile hızlı entegrasyon ve panel tabanlı gönderim akışı.",
        docsUrl: "https://basitkargo.com/api",
        dashboardUrl: "https://basitkargo.com",
        authStrategy: "Bearer token",
        capabilities: ["Sipariş aktarımı", "Etiket üretimi", "Takip senkronizasyonu"],
        accentClassName: "from-blue-600 to-cyan-500",
        credentialFields: [
            {
                key: "apiToken",
                label: "API Token",
                description: "Basit Kargo panelinden üretilen bearer token.",
                placeholder: "bk_live_xxxxx",
                required: true,
                secret: true,
                type: "password",
            },
        ],
        configurationFields: [
            {
                key: "senderProfile",
                label: "Gönderici Profili",
                description: "Basit Kargo içinde tanımlı gönderici profil adı.",
                placeholder: STOREFRONT_RUNTIME.name,
                defaultValue: STOREFRONT_RUNTIME.name,
            },
            {
                key: "addressPreference",
                label: "Adres Tercihi",
                description: "Gönderilerde kullanılacak varsayılan çıkış adresi.",
                type: "select",
                defaultValue: "home-office",
                options: [
                    { label: "Home Ofis", value: "home-office" },
                    { label: "Depo Adresi", value: "warehouse" },
                    { label: "Mağaza Adresi", value: "store" },
                ],
            },
        ],
    },
    {
        id: "shipink",
        name: "Shipink",
        shortName: "Shipink",
        description: "Kullanıcı adı ve şifre ile token üreten, çok taşıyıcılı fulfillment altyapısı.",
        docsUrl: "https://shipink.io/tr/api/",
        dashboardUrl: "https://app.shipink.io",
        authStrategy: "Email + password -> bearer token",
        capabilities: ["Depo yönetimi", "Taşıyıcı seçimleri", "Sipariş ve takip akışları"],
        accentClassName: "from-emerald-600 to-lime-500",
        credentialFields: [
            {
                key: "email",
                label: "Hesap E-postası",
                description: "Shipink API token üretiminde kullanılan kullanıcı e-postası.",
                placeholder: STOREFRONT_RUNTIME.supportEmail,
                required: true,
                type: "email",
            },
            {
                key: "password",
                label: "API Şifresi",
                description: "Shipink hesabınızın API erişim şifresi.",
                placeholder: "••••••••",
                required: true,
                secret: true,
                type: "password",
            },
        ],
        configurationFields: [
            {
                key: "warehouseId",
                label: "Depo ID",
                description: "Gönderilerin çıkacağı varsayılan depo kimliği.",
                placeholder: "warehouse_01",
            },
            {
                key: "channelCode",
                label: "Kanal Kodu",
                description: "Shipink tarafında mağazanıza atanmış kanal kodu varsa girin.",
                placeholder: `${STOREFRONT_RUNTIME.name.toLocaleLowerCase("tr").replace(/[^a-z0-9]+/g, "-")}-web`,
            },
        ],
    },
    {
        id: "geliver",
        name: "Geliver",
        shortName: "Geliver",
        description: "Organizasyon bazlı API key ile çalışan kargo orkestrasyon katmanı.",
        docsUrl: "https://geliver.io/kargo-api",
        dashboardUrl: "https://geliver.io",
        authStrategy: "API key",
        capabilities: ["Çoklu kargo orchestration", "Teslimat durumları", "Taşıyıcı fallback"],
        accentClassName: "from-amber-500 to-orange-600",
        credentialFields: [
            {
                key: "apiKey",
                label: "API Key",
                description: "Geliver panelinden oluşturulan organizasyon API anahtarı.",
                placeholder: "glv_live_xxxxx",
                required: true,
                secret: true,
                type: "password",
            },
        ],
        configurationFields: [
            {
                key: "organizationCode",
                label: "Organizasyon Kodu",
                description: "Geliver hesabınıza atanmış organizasyon kodu.",
                placeholder: STOREFRONT_RUNTIME.name.toLocaleLowerCase("tr").replace(/[^a-z0-9]+/g, "-"),
            },
            {
                key: "defaultCarrierCode",
                label: "Varsayılan Taşıyıcı Kodu",
                description: "Geliver içinde tercih edilen taşıyıcı kodu.",
                placeholder: "yurtici",
            },
        ],
    },
];

export function getShippingProviderDefinition(provider: ShippingIntegrationProvider): ShippingProviderDefinition {
    const definition = SHIPPING_PROVIDER_REGISTRY.find((item) => item.id === provider);

    if (!definition) {
        throw new Error(`Unsupported shipping provider: ${provider}`);
    }

    return definition;
}

function buildFieldValueMap(fields: ShippingIntegrationFieldDefinition[], source?: Record<string, unknown>) {
    return fields.reduce<Record<string, string>>((accumulator, field) => {
        const currentValue = source?.[field.key];
        if (typeof currentValue === "string") {
            accumulator[field.key] = currentValue;
            return accumulator;
        }

        accumulator[field.key] = field.defaultValue ?? "";
        return accumulator;
    }, {});
}

export function createEmptyShippingIntegration(provider: ShippingIntegrationProvider): ShippingIntegrationRecord {
    const definition = getShippingProviderDefinition(provider);
    const now = new Date().toISOString();

    return {
        provider,
        displayName: definition.name,
        enabled: false,
        environment: "production",
        credentials: buildFieldValueMap(definition.credentialFields),
        configuration: buildFieldValueMap(definition.configurationFields),
        automation: { ...DEFAULT_AUTOMATION },
        health: {
            status: "unknown",
            lastCheckedAt: null,
            lastError: null,
        },
        createdAt: now,
        updatedAt: now,
    };
}

export function createDefaultShippingIntegrationSettings(): ShippingIntegrationSettings {
    return {
        version: 1,
        defaultProvider: null,
        integrations: SHIPPING_PROVIDER_REGISTRY.map((provider) => createEmptyShippingIntegration(provider.id)),
    };
}

export function normalizeShippingIntegrationSettings(
    value?: Partial<ShippingIntegrationSettings> | null,
): ShippingIntegrationSettings {
    const defaults = createDefaultShippingIntegrationSettings();
    const inputIntegrations = Array.isArray(value?.integrations) ? value.integrations : [];

    const normalizedIntegrations: ShippingIntegrationRecord[] = SHIPPING_PROVIDER_REGISTRY.map((provider) => {
        const current = inputIntegrations.find((integration) => integration?.provider === provider.id);
        const base = createEmptyShippingIntegration(provider.id);

        if (!current) {
            return base;
        }

        return {
            ...base,
            ...current,
            displayName: typeof current.displayName === "string" && current.displayName.trim() ? current.displayName : base.displayName,
            enabled: Boolean(current.enabled),
            environment: current.environment === "sandbox" ? "sandbox" : "production",
            credentials: buildFieldValueMap(provider.credentialFields, current.credentials),
            configuration: buildFieldValueMap(provider.configurationFields, current.configuration),
            automation: {
                autoCreateShipment: Boolean(current.automation?.autoCreateShipment),
                autoSyncTracking: current.automation?.autoSyncTracking ?? base.automation.autoSyncTracking,
                orderTrigger: current.automation?.orderTrigger === "manual" || current.automation?.orderTrigger === "confirmed"
                    ? current.automation.orderTrigger
                    : base.automation.orderTrigger,
            },
            health: {
                status: current.health?.status === "connected" || current.health?.status === "error"
                    ? current.health.status
                    : "unknown",
                lastCheckedAt: typeof current.health?.lastCheckedAt === "string" ? current.health.lastCheckedAt : null,
                lastError: typeof current.health?.lastError === "string" ? current.health.lastError : null,
            },
            createdAt: typeof current.createdAt === "string" ? current.createdAt : base.createdAt,
            updatedAt: typeof current.updatedAt === "string" ? current.updatedAt : base.updatedAt,
        };
    });

    const defaultProvider: ShippingIntegrationProvider | null =
        normalizedIntegrations.some((integration) => integration.provider === value?.defaultProvider)
            ? (value?.defaultProvider as ShippingIntegrationProvider | null)
            : defaults.defaultProvider;

    return {
        version: 1,
        defaultProvider,
        integrations: normalizedIntegrations,
    };
}

export function hasRequiredProviderCredentials(integration: ShippingIntegrationRecord): boolean {
    const definition = getShippingProviderDefinition(integration.provider);

    return definition.credentialFields.every((field) => {
        if (!field.required) {
            return true;
        }

        const value = integration.credentials[field.key];
        return typeof value === "string" && value.trim().length > 0;
    });
}

export function maskSecretValue(value: string): string {
    if (!value) {
        return "";
    }

    if (value.length <= 6) {
        return "•".repeat(value.length);
    }

    return `${value.slice(0, 3)}${"•".repeat(Math.max(4, value.length - 5))}${value.slice(-2)}`;
}

export function mergeLegacyBasitKargoSettings(
    settings: ShippingIntegrationSettings,
    legacySettings?: { apiToken?: string; senderProfile?: string; addressPreference?: string } | null,
): ShippingIntegrationSettings {
    if (!legacySettings) {
        return settings;
    }

    const basitKargo = settings.integrations.find((integration) => integration.provider === "basit-kargo");
    if (!basitKargo) {
        return settings;
    }

    if (basitKargo.credentials.apiToken || !legacySettings.apiToken) {
        return settings;
    }

    const updatedIntegrations = settings.integrations.map((integration) => {
        if (integration.provider !== "basit-kargo") {
            return integration;
        }

        return {
            ...integration,
            credentials: {
                ...integration.credentials,
                apiToken: legacySettings.apiToken ?? integration.credentials.apiToken,
            },
            configuration: {
                ...integration.configuration,
                senderProfile: legacySettings.senderProfile ?? integration.configuration.senderProfile,
                addressPreference: legacySettings.addressPreference ?? integration.configuration.addressPreference,
            },
        };
    });

    return {
        ...settings,
        integrations: updatedIntegrations,
    };
}
