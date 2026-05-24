import { createServerClient } from "@/lib/supabase";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createDefaultEmailMarketingSettings, normalizeEmailMarketingSettings } from "@/lib/email-marketing";
import type { EmailMarketingSettings } from "@/types/email-marketing";
import type { NotificationSettings } from "@/types/notification";
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
    DEFAULT_STORE_CODE_INTEGRATIONS_SETTINGS,
    normalizeStoreCodeIntegrationsSettings,
    type StoreCodeIntegrationsSettings,
} from "@celebix/platform-config/src/code-integrations";
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
import {
    maybeGetAdminSetting,
    maybeGetAllAdminSettings,
    maybeSetAdminSetting,
    maybeDeleteAdminSetting,
} from "@/lib/db/light-postgres-read";

// =====================================================
// SETTINGS OPERATIONS
// =====================================================

export const PRIVATE_SETTING_KEY_PREFIX = "__admin_internal__";

const LIGHT_POSTGRES_CUSTOMER_FACING_SETTING_KEYS = new Set<string>([
    "announcement_bar",
    "code_integrations",
    "hero_banners",
    "homepage_curation",
    "marquee_settings",
    "product_listing_order",
    "promo_banners",
    "seo_settings",
    "shipping_options",
    "store_info",
    "variant_attributes_registry",
]);

export function isPrivateSettingKey(key: string) {
    return key.startsWith(PRIVATE_SETTING_KEY_PREFIX);
}

/**
 * Get setting by key
 */
export async function getSetting(key: string): Promise<Record<string, unknown> | null> {
    const lightPostgresValue = await maybeGetAdminSetting(key);
    if (lightPostgresValue !== undefined) {
        return (lightPostgresValue as Record<string, unknown> | null) ?? null;
    }

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
        if (isPrivateSettingKey(item.key)) {
            continue;
        }
        settings[item.key] = item.value;
    }

    const lightPostgresSettings = await maybeGetAllAdminSettings();
    if (lightPostgresSettings !== undefined) {
        for (const item of lightPostgresSettings) {
            if (LIGHT_POSTGRES_CUSTOMER_FACING_SETTING_KEYS.has(item.key)) {
                settings[item.key] = (item.value as Record<string, unknown> | null) ?? {};
            }
        }
    }

    return settings;
}

/**
 * Set setting (upsert)
 */
export async function setSetting(key: string, value: Record<string, unknown>) {
    const lightPostgresSetting = await maybeSetAdminSetting(key, value);
    if (lightPostgresSetting !== undefined) {
        return lightPostgresSetting;
    }

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
    const deletedFromLightPostgres = await maybeDeleteAdminSetting(key);
    if (deletedFromLightPostgres !== undefined) {
        return true;
    }

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
    EMAIL_MARKETING_SETTINGS: "email_marketing_settings",
    ANNOUNCEMENT_BAR: "announcement_bar",
    MARQUEE_SETTINGS: "marquee_settings",
    AI_PROVIDER: "ai_provider",
    TRANSLATION_SETTINGS: "translation_settings",
    PRODUCT_LISTING_ORDER: PRODUCT_LISTING_ORDER_SETTING_KEY,
    CODE_INTEGRATIONS: "code_integrations",
} as const;

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
    email: {
        provider: "resend",
        senderName: STORE_RUNTIME.name,
        senderEmail: STORE_RUNTIME.senderEmail,
        replyTo: STORE_RUNTIME.supportEmail,
        apiKey: "",
    },
    sms: {
        provider: "netgsm",
        apiKey: "",
        apiSecret: "",
        senderTitle: STORE_RUNTIME.smsSenderTitle,
    },
    push: {
        enabled: true,
        webPushEnabled: true,
        inboxEnabled: true,
        permissionPrompt: "manual",
        appBadgeEnabled: true,
        events: {
            new_order: true,
            new_product_review: true,
            payment_failed: true,
        },
    },
};

function normalizeNotificationSettings(value: unknown): NotificationSettings {
    const record =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
    const emailRecord =
        record.email && typeof record.email === "object" && !Array.isArray(record.email)
            ? (record.email as Record<string, unknown>)
            : {};
    const smsRecord =
        record.sms && typeof record.sms === "object" && !Array.isArray(record.sms)
            ? (record.sms as Record<string, unknown>)
            : {};
    const rawPushRecord =
        record.push && typeof record.push === "object" && !Array.isArray(record.push)
            ? (record.push as Record<string, unknown>)
            : {};
    const eventRecord =
        rawPushRecord.events &&
        typeof rawPushRecord.events === "object" &&
        !Array.isArray(rawPushRecord.events)
            ? (rawPushRecord.events as Record<string, unknown>)
            : {};

    return {
        email: {
            ...DEFAULT_NOTIFICATION_SETTINGS.email,
            ...(emailRecord as Partial<NotificationSettings["email"]>),
        },
        sms: {
            ...DEFAULT_NOTIFICATION_SETTINGS.sms,
            ...(smsRecord as Partial<NotificationSettings["sms"]>),
        },
        push: {
            enabled:
                typeof rawPushRecord.enabled === "boolean"
                    ? rawPushRecord.enabled
                    : DEFAULT_NOTIFICATION_SETTINGS.push.enabled,
            webPushEnabled:
                typeof rawPushRecord.webPushEnabled === "boolean"
                    ? rawPushRecord.webPushEnabled
                    : DEFAULT_NOTIFICATION_SETTINGS.push.webPushEnabled,
            inboxEnabled:
                typeof rawPushRecord.inboxEnabled === "boolean"
                    ? rawPushRecord.inboxEnabled
                    : DEFAULT_NOTIFICATION_SETTINGS.push.inboxEnabled,
            permissionPrompt:
                rawPushRecord.permissionPrompt === "disabled"
                    ? "disabled"
                    : DEFAULT_NOTIFICATION_SETTINGS.push.permissionPrompt,
            appBadgeEnabled:
                typeof rawPushRecord.appBadgeEnabled === "boolean"
                    ? rawPushRecord.appBadgeEnabled
                    : DEFAULT_NOTIFICATION_SETTINGS.push.appBadgeEnabled,
            events: {
                new_order:
                    typeof eventRecord.new_order === "boolean"
                        ? eventRecord.new_order
                        : DEFAULT_NOTIFICATION_SETTINGS.push.events.new_order,
                new_product_review:
                    typeof eventRecord.new_product_review === "boolean"
                        ? eventRecord.new_product_review
                        : DEFAULT_NOTIFICATION_SETTINGS.push.events.new_product_review,
                payment_failed:
                    typeof eventRecord.payment_failed === "boolean"
                        ? eventRecord.payment_failed
                        : DEFAULT_NOTIFICATION_SETTINGS.push.events.payment_failed,
            },
        },
    };
}

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
    timezone?: string;
    taxRate: number;
    logoUrl?: string;
    faviconUrl?: string;
    socialInstagram?: string;
    socialTwitter?: string;
    typography?: StoreTypographySettings;
    floatingContact?: FloatingContactSettings;
}

export type SEOSettings = StoreSeoSettings;
export type TranslationSettings = StoreTranslationSettings;
export type CodeIntegrationsSettings = StoreCodeIntegrationsSettings;
export type { ProductListingOrderSettings };

export interface HomepageCurationSettings {
    featuredCategorySlugs: string[];
    featuredProductIdsByCategory: Record<string, string[]>;
    enforceFeaturedProductCaps: boolean;
    updatedAt?: string;
}

type HomepageCurationProductCandidate = {
    id: string;
    category: string | null;
    subcategory: string | null;
};

const MAX_HOMEPAGE_FEATURED_CATEGORIES = 4;
const MAX_HOMEPAGE_FEATURED_PRODUCTS_PER_CATEGORY = 4;
const MAX_HOMEPAGE_FEATURED_PRODUCTS_TOTAL = 16;

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

    let remainingCapacity = MAX_HOMEPAGE_FEATURED_PRODUCTS_TOTAL;

    return featuredCategorySlugs.reduce<Record<string, string[]>>((result, slug) => {
        const normalizedKey = normalizeHomepageCategoryKey(slug);
        if (!normalizedKey || !allowedCategories.has(normalizedKey) || remainingCapacity <= 0) {
            return result;
        }

        const rawValue = record[slug] ?? record[normalizedKey];
        const normalizedIds = Array.isArray(rawValue)
            ? rawValue
                .filter((entry): entry is string => typeof entry === "string")
                .map((entry) => entry.trim())
                .filter(Boolean)
                .filter((entry, index, source) => source.indexOf(entry) === index)
                .slice(0, Math.min(MAX_HOMEPAGE_FEATURED_PRODUCTS_PER_CATEGORY, remainingCapacity))
            : [];

        if (normalizedIds.length > 0) {
            result[normalizedKey] = normalizedIds;
            remainingCapacity -= normalizedIds.length;
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

async function sanitizeHomepageCurationSettingsAgainstCatalog(
    settings: HomepageCurationSettings,
): Promise<HomepageCurationSettings> {
    if (settings.featuredCategorySlugs.length === 0) {
        return {
            ...settings,
            featuredProductIdsByCategory: {},
        };
    }

    const serverClient = createServerClient();
    const [categoriesResponse, productsResponse] = await Promise.all([
        serverClient.from("categories").select("slug, is_active"),
        serverClient.from("products").select("id, category, subcategory"),
    ]);

    if (categoriesResponse.error) {
        throw categoriesResponse.error;
    }

    if (productsResponse.error) {
        throw productsResponse.error;
    }

    const activeCategorySlugSet = new Set(
        (categoriesResponse.data || [])
            .filter((category) => category.is_active !== false)
            .map((category) => normalizeHomepageCategoryKey(category.slug || ""))
            .filter(Boolean),
    );

    const featuredCategorySlugs = settings.featuredCategorySlugs.filter((slug) =>
        activeCategorySlugSet.has(normalizeHomepageCategoryKey(slug)),
    );

    if (featuredCategorySlugs.length === 0) {
        return {
            ...settings,
            featuredCategorySlugs: [],
            featuredProductIdsByCategory: {},
        };
    }

    const productLookup = new Map<string, HomepageCurationProductCandidate>(
        ((productsResponse.data || []) as HomepageCurationProductCandidate[]).map((product) => [
            product.id,
            {
                id: product.id,
                category: typeof product.category === "string" ? product.category : null,
                subcategory: typeof product.subcategory === "string" ? product.subcategory : null,
            },
        ]),
    );

    let remainingCapacity = MAX_HOMEPAGE_FEATURED_PRODUCTS_TOTAL;
    const featuredProductIdsByCategory = featuredCategorySlugs.reduce<Record<string, string[]>>((result, slug) => {
        const normalizedSlug = normalizeHomepageCategoryKey(slug);
        if (!normalizedSlug || remainingCapacity <= 0) {
            return result;
        }

        const rawIds = settings.featuredProductIdsByCategory[normalizedSlug] || [];
        const validIds = rawIds
            .filter((productId) => {
                const product = productLookup.get(productId);
                if (!product) {
                    return false;
                }

                const productCategory = normalizeHomepageCategoryKey(product.category || "");
                const productSubcategory = normalizeHomepageCategoryKey(product.subcategory || "");
                return productCategory === normalizedSlug || productSubcategory === normalizedSlug;
            })
            .slice(0, Math.min(MAX_HOMEPAGE_FEATURED_PRODUCTS_PER_CATEGORY, remainingCapacity));

        if (validIds.length > 0) {
            result[normalizedSlug] = validIds;
            remainingCapacity -= validIds.length;
        }

        return result;
    }, {});

    return {
        ...settings,
        featuredCategorySlugs,
        featuredProductIdsByCategory,
    };
}

export async function getHomepageCurationSettings(): Promise<HomepageCurationSettings> {
    const data = await getSetting(SETTING_KEYS.HOMEPAGE_CURATION);
    const normalizedSettings = normalizeHomepageCurationSettings(data);

    try {
        const sanitizedSettings = await sanitizeHomepageCurationSettingsAgainstCatalog(normalizedSettings);

        if (JSON.stringify(sanitizedSettings) !== JSON.stringify(normalizedSettings)) {
            const updatedAt = new Date().toISOString();
            await setSetting(SETTING_KEYS.HOMEPAGE_CURATION, {
                ...sanitizedSettings,
                updatedAt,
            } as Record<string, unknown>);

            return {
                ...sanitizedSettings,
                updatedAt,
            };
        }

        return sanitizedSettings;
    } catch (error) {
        console.error("Failed to sanitize homepage curation settings against catalog:", error);
        return normalizedSettings;
    }
}

export async function setHomepageCurationSettings(settings: HomepageCurationSettings) {
    return setSetting(
        SETTING_KEYS.HOMEPAGE_CURATION,
        {
            ...normalizeHomepageCurationSettings(settings),
            updatedAt: new Date().toISOString(),
        } as Record<string, unknown>,
    );
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
    const data = await getSetting(SETTING_KEYS.NOTIFICATION_SETTINGS);
    return normalizeNotificationSettings(data);
}

export async function setNotificationSettings(settings: NotificationSettings) {
    return setSetting(
        SETTING_KEYS.NOTIFICATION_SETTINGS,
        normalizeNotificationSettings(settings) as unknown as Record<string, unknown>,
    );
}

export async function getEmailMarketingSettings(): Promise<EmailMarketingSettings> {
    const data = await getSetting(SETTING_KEYS.EMAIL_MARKETING_SETTINGS);
    return normalizeEmailMarketingSettings(data as Partial<EmailMarketingSettings> | null);
}

export async function setEmailMarketingSettings(settings: EmailMarketingSettings) {
    return setSetting(
        SETTING_KEYS.EMAIL_MARKETING_SETTINGS,
        normalizeEmailMarketingSettings(settings) as unknown as Record<string, unknown>,
    );
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

export async function getCodeIntegrationsSettings(): Promise<CodeIntegrationsSettings> {
    const data = await getSetting(SETTING_KEYS.CODE_INTEGRATIONS);
    return normalizeStoreCodeIntegrationsSettings(
        data as Partial<StoreCodeIntegrationsSettings> | null,
        DEFAULT_STORE_CODE_INTEGRATIONS_SETTINGS,
    );
}

export async function setCodeIntegrationsSettings(settings: CodeIntegrationsSettings) {
    return setSetting(
        SETTING_KEYS.CODE_INTEGRATIONS,
        normalizeStoreCodeIntegrationsSettings(settings) as unknown as Record<string, unknown>,
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

export async function setProductListingOrderPositions(positions: Record<string, number>) {
    return setSetting(SETTING_KEYS.PRODUCT_LISTING_ORDER, {
        positions,
        updatedAt: new Date().toISOString(),
    });
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
