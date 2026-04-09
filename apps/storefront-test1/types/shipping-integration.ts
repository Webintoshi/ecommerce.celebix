export type ShippingIntegrationProvider = "basit-kargo" | "shipink" | "geliver";

export type ShippingIntegrationEnvironment = "production" | "sandbox";

export type ShippingIntegrationHealthStatus = "unknown" | "connected" | "error";

export type ShippingIntegrationOrderTrigger = "manual" | "confirmed" | "preparing";

export type ShippingIntegrationFieldType = "text" | "password" | "email" | "select";

export interface ShippingIntegrationFieldOption {
    label: string;
    value: string;
}

export interface ShippingIntegrationFieldDefinition {
    key: string;
    label: string;
    description: string;
    placeholder?: string;
    required?: boolean;
    secret?: boolean;
    type?: ShippingIntegrationFieldType;
    defaultValue?: string;
    options?: ShippingIntegrationFieldOption[];
}

export interface ShippingProviderDefinition {
    id: ShippingIntegrationProvider;
    name: string;
    shortName: string;
    description: string;
    docsUrl: string;
    dashboardUrl: string;
    authStrategy: string;
    capabilities: string[];
    accentClassName: string;
    credentialFields: ShippingIntegrationFieldDefinition[];
    configurationFields: ShippingIntegrationFieldDefinition[];
}

export interface ShippingIntegrationHealth {
    status: ShippingIntegrationHealthStatus;
    lastCheckedAt: string | null;
    lastError: string | null;
}

export interface ShippingIntegrationAutomation {
    autoCreateShipment: boolean;
    autoSyncTracking: boolean;
    orderTrigger: ShippingIntegrationOrderTrigger;
}

export interface ShippingIntegrationRecord {
    provider: ShippingIntegrationProvider;
    displayName: string;
    enabled: boolean;
    environment: ShippingIntegrationEnvironment;
    credentials: Record<string, string>;
    configuration: Record<string, string>;
    automation: ShippingIntegrationAutomation;
    health: ShippingIntegrationHealth;
    createdAt: string;
    updatedAt: string;
}

export interface ShippingIntegrationSettings {
    version: 1;
    defaultProvider: ShippingIntegrationProvider | null;
    integrations: ShippingIntegrationRecord[];
}
