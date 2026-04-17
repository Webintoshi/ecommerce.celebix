import { createServerClient } from "@/lib/supabase";
import type { StoreTypographySettings } from "@celebix/platform-config/src/typography";
import {
    DEFAULT_STORE_SEO_SETTINGS,
    normalizeStoreSeoSettings,
    type StoreSeoSettings,
} from "@celebix/platform-config/src/seo";
import {
    normalizeShippingZones,
    type ShippingZone,
} from "@celebix/platform-config/src/shipping";
import {
    DEFAULT_STORE_TRANSLATION_SETTINGS,
    normalizeStoreTranslationSettings,
    type StoreTranslationSettings,
} from "@celebix/platform-config/src/translation";
import {
    normalizeProductListingOrderSettings,
    PRODUCT_LISTING_ORDER_SETTING_KEY,
    type ProductListingOrderSettings,
} from "@celebix/platform-config/src/product-listing-order";
import {
    normalizeFloatingContactSettings,
    type FloatingContactSettings,
} from "@celebix/platform-config/src/floating-contact";
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
    HOMEPAGE_CURATION: "homepage_curation",
    SEO_SETTINGS: "seo_settings",
    EMAIL_SETTINGS: "email_settings",
    NOTIFICATION_SETTINGS: "notification_settings",
    ANNOUNCEMENT_BAR: "announcement_bar",
    MARQUEE_SETTINGS: "marquee_settings",
    AI_PROVIDER: "ai_provider",
    TRANSLATION_SETTINGS: "translation_settings",
    PRODUCT_LISTING_ORDER: PRODUCT_LISTING_ORDER_SETTING_KEY,
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

export type ShippingOption = ShippingZone;

export interface StoreInfo {
    name: string;
    email: string;
    phone: string;
    address: string;
    currency: string;
    taxRate: number;
    timezone?: string;
    logoUrl?: string;
    faviconUrl?: string;
    socialInstagram?: string;
    socialTwitter?: string;
    typography?: StoreTypographySettings;
    floatingContact?: FloatingContactSettings;
}

export type SEOSettings = StoreSeoSettings;
export type TranslationSettings = StoreTranslationSettings;
export type { ProductListingOrderSettings };

export interface HomepageCurationSettings {
    featuredCategorySlugs: string[];
    featuredProductIdsByCategory: Record<string, string[]>;
    enforceFeaturedProductCaps: boolean;
    updatedAt?: string;
}

const MAX_HOMEPAGE_FEATURED_CATEGORIES = 4;
const MAX_HOMEPAGE_FEATURED_PRODUCTS_PER_CATEGORY = 4;

function normalizeHomepageCategoryKey(value: string) {
    return value
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function normalizeHomepageFeaturedProductIdsByCategory(
    value: unknown,
    featuredCategorySlugs: string[],
) {
    const record =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    const allowedCategories = new Set(
        featuredCategorySlugs
            .map((entry) => normalizeHomepageCategoryKey(entry))
            .filter(Boolean),
    );

    return Object.entries(record).reduce<Record<string, string[]>>((result, [rawKey, rawValue]) => {
        const normalizedKey = normalizeHomepageCategoryKey(rawKey);
        if (!normalizedKey || !allowedCategories.has(normalizedKey)) {
            return result;
        }

        const normalizedIds = Array.isArray(rawValue)
            ? rawValue
                .filter((entry): entry is string => typeof entry === "string")
                .map((entry) => entry.trim())
                .filter(Boolean)
                .filter((entry, index, source) => source.indexOf(entry) === index)
                .slice(0, MAX_HOMEPAGE_FEATURED_PRODUCTS_PER_CATEGORY)
            : [];

        if (normalizedIds.length > 0) {
            result[normalizedKey] = normalizedIds;
        }

        return result;
    }, {});
}

export function normalizeHomepageCurationSettings(value: unknown): HomepageCurationSettings {
    const record =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    const featuredCategorySlugs = Array.isArray(record.featuredCategorySlugs)
        ? record.featuredCategorySlugs
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean)
            .filter((entry, index, source) => source.indexOf(entry) === index)
            .slice(0, MAX_HOMEPAGE_FEATURED_CATEGORIES)
        : [];

    return {
        featuredCategorySlugs,
        featuredProductIdsByCategory: normalizeHomepageFeaturedProductIdsByCategory(
            record.featuredProductIdsByCategory,
            featuredCategorySlugs,
        ),
        enforceFeaturedProductCaps: Boolean(record.enforceFeaturedProductCaps),
        updatedAt:
            typeof record.updatedAt === "string" && record.updatedAt.trim().length > 0
                ? record.updatedAt
                : undefined,
    };
}

export async function getHomepageCurationSettings(): Promise<HomepageCurationSettings> {
    const data = await getSetting(SETTING_KEYS.HOMEPAGE_CURATION);
    return normalizeHomepageCurationSettings(data);
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
    return normalizeShippingZones(data);
}

/**
 * Set shipping options
 */
export async function setShippingOptions(options: ShippingOption[]) {
    return setSetting(SETTING_KEYS.SHIPPING_OPTIONS, { options: normalizeShippingZones(options) });
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
    if (!data) {
        return null;
    }

    return {
        ...(data as StoreInfo),
        floatingContact: normalizeFloatingContactSettings(
            (data as StoreInfo).floatingContact,
        ),
    };
}

/**
 * Set store info
 */
export async function setStoreInfo(info: StoreInfo) {
    return setSetting(
        SETTING_KEYS.STORE_INFO,
        {
            ...info,
            floatingContact: normalizeFloatingContactSettings(info.floatingContact),
        } as unknown as Record<string, unknown>,
    );
}

/**
 * Get SEO settings
 */
export async function getSeoSettings(): Promise<SEOSettings> {
    const data = await getSetting(SETTING_KEYS.SEO_SETTINGS);
    return normalizeStoreSeoSettings(
        data as Partial<StoreSeoSettings> | null,
        DEFAULT_STORE_SEO_SETTINGS,
    );
}

/**
 * Set SEO settings
 */
export async function setSeoSettings(settings: SEOSettings) {
    return setSetting(
        SETTING_KEYS.SEO_SETTINGS,
        normalizeStoreSeoSettings(settings) as unknown as Record<string, unknown>,
    );
}

/**
 * Get translation settings
 */
export async function getTranslationSettings(): Promise<TranslationSettings> {
    const data = await getSetting(SETTING_KEYS.TRANSLATION_SETTINGS);
    return normalizeStoreTranslationSettings(
        data as Partial<StoreTranslationSettings> | null,
        DEFAULT_STORE_TRANSLATION_SETTINGS,
    );
}

/**
 * Set translation settings
 */
export async function setTranslationSettings(settings: TranslationSettings) {
    return setSetting(
        SETTING_KEYS.TRANSLATION_SETTINGS,
        normalizeStoreTranslationSettings(settings) as unknown as Record<string, unknown>,
    );
}

export async function getProductListingOrder(): Promise<ProductListingOrderSettings> {
    const data = await getSetting(SETTING_KEYS.PRODUCT_LISTING_ORDER);
    return normalizeProductListingOrderSettings(data);
}

export async function getProductListingOrderPositions(): Promise<Record<string, number>> {
    const settings = await getProductListingOrder();
    return settings.positions;
}

// =====================================================
// ANNOUNCEMENT BAR SETTINGS
// =====================================================

export interface AnnouncementBarSettings {
    message: string;
    link: string;
    linkText: string;
    enabled: boolean;
    backgroundColor?: string;
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
