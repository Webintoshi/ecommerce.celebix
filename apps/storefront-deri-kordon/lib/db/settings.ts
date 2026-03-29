import { createServerClient } from "@/lib/supabase";
import {
    ShippingIntegrationSettings,
} from "@/types/shipping-integration";
import {
    createDefaultShippingIntegrationSettings,
    normalizeShippingIntegrationSettings,
} from "@/lib/shipping-integrations";

// =====================================================
// SETTINGS OPERATIONS
// =====================================================

/**
 * Get setting by key
 */
export async function getSetting(key: string): Promise<Record<string, unknown> | null> {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("settings")
        .select("value")
        .eq("key", key)
        .single();

    if (error) return null;
    return data?.value || null;
}

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<Record<string, Record<string, unknown>>> {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("settings")
        .select("key, value");

    if (error) throw error;

    const settings: Record<string, Record<string, unknown>> = {};
    for (const item of data || []) {
        settings[item.key] = item.value;
    }
    return settings;
}

/**
 * Set setting (upsert)
 */
export async function setSetting(key: string, value: Record<string, unknown>) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("settings")
        .upsert({ key, value }, { onConflict: "key" })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete setting
 */
export async function deleteSetting(key: string) {
    const serverClient = createServerClient();

    const { error } = await serverClient
        .from("settings")
        .delete()
        .eq("key", key);

    if (error) throw error;
    return true;
}

// =====================================================
// PREDEFINED SETTING KEYS
// =====================================================

export const SETTING_KEYS = {
    PAYMENT_METHODS: "payment_methods",
    SHIPPING_OPTIONS: "shipping_options",
    SHIPPING_INTEGRATIONS: "shipping_integrations",
    STORE_INFO: "store_info",
    SEO_SETTINGS: "seo_settings",
    EMAIL_SETTINGS: "email_settings",
    NOTIFICATION_SETTINGS: "notification_settings",
    ANNOUNCEMENT_BAR: "announcement_bar",
    MARQUEE_SETTINGS: "marquee_settings",
    AI_PROVIDER: "ai_provider",
} as const;

// =====================================================
// TYPED SETTING HELPERS
// =====================================================

export interface PaymentMethod {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    instructions?: string;
}

export interface ShippingOption {
    id: string;
    name: string;
    price: number;
    minOrder?: number;
    estimatedDays: string;
    enabled: boolean;
}

export interface StoreInfo {
    name: string;
    email: string;
    phone: string;
    address: string;
    currency: string;
    taxRate: number;
}

/**
 * Get payment methods
 */
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
    const data = await getSetting(SETTING_KEYS.PAYMENT_METHODS);
    return (data?.methods as PaymentMethod[]) || [];
}

/**
 * Set payment methods
 */
export async function setPaymentMethods(methods: PaymentMethod[]) {
    return setSetting(SETTING_KEYS.PAYMENT_METHODS, { methods });
}

/**
 * Get shipping options
 */
export async function getShippingOptions(): Promise<ShippingOption[]> {
    const data = await getSetting(SETTING_KEYS.SHIPPING_OPTIONS);
    return (data?.options as ShippingOption[]) || [];
}

/**
 * Set shipping options
 */
export async function setShippingOptions(options: ShippingOption[]) {
    return setSetting(SETTING_KEYS.SHIPPING_OPTIONS, { options });
}

/**
 * Get shipping integrations
 */
export async function getShippingIntegrations(): Promise<ShippingIntegrationSettings> {
    const data = await getSetting(SETTING_KEYS.SHIPPING_INTEGRATIONS);

    if (!data) {
        return createDefaultShippingIntegrationSettings();
    }

    return normalizeShippingIntegrationSettings(data as Partial<ShippingIntegrationSettings>);
}

/**
 * Set shipping integrations
 */
export async function setShippingIntegrations(settings: ShippingIntegrationSettings) {
    return setSetting(
        SETTING_KEYS.SHIPPING_INTEGRATIONS,
        settings as unknown as Record<string, unknown>,
    );
}

/**
 * Get store info
 */
export async function getStoreInfo(): Promise<StoreInfo | null> {
    const data = await getSetting(SETTING_KEYS.STORE_INFO);
    return data as StoreInfo | null;
}

/**
 * Set store info
 */
export async function setStoreInfo(info: StoreInfo) {
    return setSetting(SETTING_KEYS.STORE_INFO, info as unknown as Record<string, unknown>);
}

// =====================================================
// ANNOUNCEMENT BAR SETTINGS
// =====================================================

export interface AnnouncementBarSettings {
    message: string;
    link: string;
    linkText: string;
    enabled: boolean;
}

/**
 * Get announcement bar settings
 */
export async function getAnnouncementBarSettings(): Promise<AnnouncementBarSettings | null> {
    const data = await getSetting(SETTING_KEYS.ANNOUNCEMENT_BAR);
    return data as AnnouncementBarSettings | null;
}

/**
 * Set announcement bar settings
 */
export async function setAnnouncementBarSettings(settings: AnnouncementBarSettings) {
    return setSetting(SETTING_KEYS.ANNOUNCEMENT_BAR, settings as unknown as Record<string, unknown>);
}

// =====================================================
// MARQUEE SETTINGS
// =====================================================

export type MarqueeIcon = 'leaf' | 'truck' | 'shield' | 'heart' | 'award' | 'sparkle';
export type MarqueeSpeed = 'slow' | 'normal' | 'fast';
export type MarqueeDirection = 'left' | 'right';
export type MarqueeAnimation = 'marquee' | 'fade' | 'slide';

export interface MarqueeItem {
    id: string;
    text: string;
    icon?: MarqueeIcon;
    badge?: string;
    link?: string;
}

export interface MarqueeSettings {
    items: MarqueeItem[];
    speed?: MarqueeSpeed;
    direction?: MarqueeDirection;
    pauseOnHover?: boolean;
    showStars?: boolean;
    animation?: MarqueeAnimation;
    enabled?: boolean;
}

const DEFAULT_MARQUEE_SETTINGS: MarqueeSettings = {
    items: [
        { id: '1', text: "Taze Fıstık Ezmesi", icon: "leaf", badge: "Taze" },
        { id: '2', text: "Aynı Gün Kargo", icon: "truck", badge: "Hızlı" },
        { id: '3', text: "Kalite Belgeli", icon: "award", badge: "Garanti" },
        { id: '4', text: "Ev Yapımı Tarif", icon: "heart", badge: "Özel" },
    ],
    speed: 'normal',
    direction: 'left',
    pauseOnHover: true,
    showStars: true,
    animation: 'marquee',
    enabled: true,
};

/**
 * Get marquee settings
 */
export async function getMarqueeSettings(): Promise<MarqueeSettings> {
    const data = await getSetting(SETTING_KEYS.MARQUEE_SETTINGS);
    return data ? { ...DEFAULT_MARQUEE_SETTINGS, ...data as MarqueeSettings } : DEFAULT_MARQUEE_SETTINGS;
}

/**
 * Set marquee settings
 */
export async function setMarqueeSettings(settings: MarqueeSettings) {
    return setSetting(SETTING_KEYS.MARQUEE_SETTINGS, settings as unknown as Record<string, unknown>);
}

// =====================================================
// AI PROVIDER SETTINGS
// =====================================================

export type AIProviderType = "gemini" | "claude" | "deepseek";

export interface AIProviderSettings {
    provider: AIProviderType;
    apiKey: string;
    model?: string;
}

/**
 * Get AI provider settings
 */
export async function getAIProviderSettings(): Promise<AIProviderSettings | null> {
    const data = await getSetting(SETTING_KEYS.AI_PROVIDER);
    return data as AIProviderSettings | null;
}

/**
 * Set AI provider settings
 */
export async function setAIProviderSettings(settings: AIProviderSettings) {
    return setSetting(SETTING_KEYS.AI_PROVIDER, settings as unknown as Record<string, unknown>);
}
