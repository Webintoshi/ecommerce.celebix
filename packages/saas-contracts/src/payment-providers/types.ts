import type { MerchantAdminJson } from "../merchant-admin/types.ts";

export const PAYMENT_PROVIDER_READINESS = Object.freeze([
  "production_ready", "sandbox_ready", "verification", "planned", "maintenance",
] as const);
export type PaymentProviderReadiness = (typeof PAYMENT_PROVIDER_READINESS)[number];

export const PAYMENT_PROVIDER_INTERACTION_MODES = Object.freeze([
  "redirect", "iframe", "tokenized", "direct_pos", "wallet", "offline",
] as const);
export type PaymentProviderInteractionMode = (typeof PAYMENT_PROVIDER_INTERACTION_MODES)[number];

export const PAYMENT_METHOD_STATES = Object.freeze([
  "active", "disabled", "emergency_disabled",
] as const);
export type PaymentMethodState = (typeof PAYMENT_METHOD_STATES)[number];

export const PAYMENT_METHOD_KINDS = Object.freeze([
  "provider", "cash_on_delivery", "bank_transfer",
] as const);
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export type PaymentProviderCategory = "bank_pos" | "payment_institution" | "wallet" | "international";
export type PaymentProviderSupport = "yes" | "no" | "unknown";
export type PaymentProviderEnvironment = "test" | "live";

export interface PaymentProviderExecutionAuthority {
  readonly environment: PaymentProviderEnvironment;
  readonly adapterVersion: number;
  readonly evidenceDigest: string;
}

export interface PaymentProviderCatalogEntry {
  readonly providerCode: string;
  readonly familyCode: string;
  readonly modeCode: string;
  readonly sourceSlug: string;
  readonly label: string;
  readonly modeLabel: string;
  readonly category: PaymentProviderCategory;
  readonly interactionMode: Exclude<PaymentProviderInteractionMode, "offline">;
  readonly readiness: PaymentProviderReadiness;
  readonly executionAuthority: Readonly<PaymentProviderExecutionAuthority> | null;
  readonly support: Readonly<{
    readonly threeDSecure: PaymentProviderSupport;
    readonly installments: PaymentProviderSupport;
    readonly refund: PaymentProviderSupport;
    readonly cancel: PaymentProviderSupport;
    readonly capture: PaymentProviderSupport;
  }>;
  readonly logoPath: string;
  readonly aliases: readonly string[];
  readonly environments: readonly PaymentProviderEnvironment[];
}

export interface MerchantPaymentMethod {
  readonly id: string;
  readonly kind: PaymentMethodKind;
  readonly profileId: string | null;
  readonly providerCode: string | null;
  readonly label: string;
  readonly state: PaymentMethodState;
  readonly emergencyReason: string | null;
  readonly position: number;
  readonly config: Readonly<Record<string, MerchantAdminJson>>;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PaymentMethodMutationResult {
  readonly id: string;
  readonly state: PaymentMethodState;
  readonly position: number;
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}

export interface PaymentMethodReorderResult {
  readonly items: readonly PaymentMethodMutationResult[];
  readonly replayed: boolean;
}
