import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { testAIConnection } from "@/lib/ai";
import {
    getShippingProviderDefinition,
    SHIPPING_PROVIDER_REGISTRY,
    normalizeShippingIntegrationSettings,
} from "@/lib/shipping-integrations";
import {
    deleteSetting,
    getAIProviderSettings,
    getAnnouncementBarSettings,
    getMarqueeSettings,
    getNotificationSettings,
    getPaymentMethods,
    getSeoSettings,
    getSetting,
    getShippingIntegrations,
    getShippingOptions,
    getStoreInfo,
    getTranslationSettings,
    setAIProviderSettings,
    setAnnouncementBarSettings,
    setMarqueeSettings,
    setNotificationSettings,
    setPaymentMethods,
    setSeoSettings,
    setSetting,
    setShippingIntegrations,
    setShippingOptions,
    setStoreInfo,
    setTranslationSettings,
    type AIProviderSettings,
} from "@/lib/db/settings";
import { extractAdminStoredAssetUrl, resolveAdminAssetUrl, resolveAdminDirectAssetUrl } from "@/lib/asset-url";
import { normalizeFloatingContactSettings } from "@celebix/platform-config/src/floating-contact";
import { requireLegacyAdminApi } from "@/lib/legacy-admin-api-auth";
import {
    redactNotificationSettings,
    redactSecretFields,
    redactStoredSecret,
    restoreNotificationSettings,
    restoreSecretFields,
    restoreStoredSecret,
    STORED_SECRET,
} from "@/lib/legacy-settings-secrets";
import type { ShippingIntegrationSettings } from "@/types/shipping-integration";

const editableContentKeys = ["hero_banners", "promo_banners"];
const readableContentTypes = ["store", "seo", "announcement", "marquee"];
const editableContentTypes = ["seo", "announcement", "marquee"];
const privateSettingsHeaders = { "Cache-Control": "private, no-store" };

function shippingSecretKeys(integration: ShippingIntegrationSettings["integrations"][number]) {
    return getShippingProviderDefinition(integration.provider).credentialFields
        .filter((field) => field.secret)
        .map((field) => field.key);
}

function redactShippingIntegrations(settings: ShippingIntegrationSettings): ShippingIntegrationSettings {
    return {
        ...settings,
        integrations: settings.integrations.map((integration) => ({
            ...integration,
            credentials: redactSecretFields(integration.credentials, shippingSecretKeys(integration)),
        })),
    };
}

function restoreShippingIntegrations(settings: ShippingIntegrationSettings, current: ShippingIntegrationSettings) {
    return {
        ...settings,
        integrations: settings.integrations.map((integration) => ({
            ...integration,
            credentials: restoreSecretFields(
                integration.credentials,
                current.integrations.find(({ provider }) => provider === integration.provider)?.credentials,
                shippingSecretKeys(integration),
            ),
        })),
    };
}

async function restoreAISettings(settings: AIProviderSettings) {
    if (settings.apiKey !== STORED_SECRET) return settings;

    const stored = await getAIProviderSettings();
    return {
        ...settings,
        apiKey: restoreStoredSecret(settings.apiKey, stored?.provider === settings.provider ? stored.apiKey : "") ?? "",
    };
}

const shippingProviderIds = SHIPPING_PROVIDER_REGISTRY.map((provider) => provider.id);

const shippingProviderEnum = z.enum([
    shippingProviderIds[0],
    shippingProviderIds[1],
    shippingProviderIds[2],
]);

const shippingIntegrationSettingsSchema = z.object({
    version: z.literal(1).optional(),
    defaultProvider: shippingProviderEnum.nullable(),
    integrations: z.array(z.object({
        provider: shippingProviderEnum,
        displayName: z.string().trim().min(1).max(120),
        enabled: z.boolean(),
        environment: z.enum(["production", "sandbox"]),
        credentials: z.record(z.string(), z.string()),
        configuration: z.record(z.string(), z.string()),
        automation: z.object({
            autoCreateShipment: z.boolean(),
            autoSyncTracking: z.boolean(),
            orderTrigger: z.enum(["manual", "confirmed", "preparing"]),
        }),
        health: z.object({
            status: z.enum(["unknown", "connected", "error"]),
            lastCheckedAt: z.string().nullable(),
            lastError: z.string().nullable(),
        }),
        createdAt: z.string(),
        updatedAt: z.string(),
    })),
});

function normalizeHeroBannersForAdmin(value: unknown) {
    if (!value || typeof value !== "object") {
        return value;
    }

    const record = value as Record<string, unknown>;
    const slides = Array.isArray(record.slides) ? record.slides : [];

    return {
        ...record,
        slides: slides.map((slide) => {
            if (!slide || typeof slide !== "object") {
                return slide;
            }

            const slideRecord = slide as Record<string, unknown>;
            const video =
                slideRecord.video && typeof slideRecord.video === "object"
                    ? (slideRecord.video as Record<string, unknown>)
                    : null;

            return {
                ...slideRecord,
                desktop: resolveAdminAssetUrl(typeof slideRecord.desktop === "string" ? slideRecord.desktop : null) || "",
                mobile: resolveAdminAssetUrl(typeof slideRecord.mobile === "string" ? slideRecord.mobile : null) || "",
                tablet: resolveAdminAssetUrl(typeof slideRecord.tablet === "string" ? slideRecord.tablet : null) || "",
                video: video
                    ? {
                        ...video,
                        desktop: resolveAdminDirectAssetUrl(extractAdminStoredAssetUrl(typeof video.desktop === "string" ? video.desktop : null)),
                        mobile: resolveAdminDirectAssetUrl(extractAdminStoredAssetUrl(typeof video.mobile === "string" ? video.mobile : null)),
                        poster: resolveAdminAssetUrl(typeof video.poster === "string" ? video.poster : null) || "",
                    }
                    : slideRecord.video,
            };
        }),
    };
}

function extractHeroBannersForStorage(value: unknown) {
    if (!value || typeof value !== "object") {
        return value;
    }

    const record = value as Record<string, unknown>;
    const slides = Array.isArray(record.slides) ? record.slides : [];

    return {
        ...record,
        slides: slides.map((slide) => {
            if (!slide || typeof slide !== "object") {
                return slide;
            }

            const slideRecord = slide as Record<string, unknown>;
            const video =
                slideRecord.video && typeof slideRecord.video === "object"
                    ? (slideRecord.video as Record<string, unknown>)
                    : null;

            return {
                ...slideRecord,
                desktop: extractAdminStoredAssetUrl(typeof slideRecord.desktop === "string" ? slideRecord.desktop : null),
                mobile: extractAdminStoredAssetUrl(typeof slideRecord.mobile === "string" ? slideRecord.mobile : null),
                tablet: extractAdminStoredAssetUrl(typeof slideRecord.tablet === "string" ? slideRecord.tablet : null),
                video: video
                    ? {
                        ...video,
                        desktop: extractAdminStoredAssetUrl(typeof video.desktop === "string" ? video.desktop : null),
                        mobile: extractAdminStoredAssetUrl(typeof video.mobile === "string" ? video.mobile : null),
                        poster: extractAdminStoredAssetUrl(typeof video.poster === "string" ? video.poster : null),
                    }
                    : slideRecord.video,
            };
        }),
    };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get("key");
        const type = searchParams.get("type");
        const contentRead = type ? readableContentTypes.includes(type) : editableContentKeys.includes(key ?? "");
        const denied = await requireLegacyAdminApi(request, contentRead ? "admin" : "settings");
        if (denied) return denied;

        if (type === "payment") {
            const methods = await getPaymentMethods();
            return NextResponse.json({
                success: true,
                paymentMethods: methods.map(({ id, name, type: methodType, enabled, instructions }) => ({
                    id,
                    name,
                    type: methodType,
                    enabled,
                    instructions,
                })),
            }, { headers: privateSettingsHeaders });
        }

        if (type === "shipping") {
            const options = await getShippingOptions();
            return NextResponse.json({ success: true, shippingOptions: options });
        }

        if (type === "shipping-integrations") {
            const integrations = await getShippingIntegrations();
            return NextResponse.json(
                { success: true, shippingIntegrations: redactShippingIntegrations(integrations) },
                { headers: privateSettingsHeaders },
            );
        }

        if (type === "store") {
            const info = await getStoreInfo();
            return NextResponse.json({
                success: true,
                storeInfo: info
                    ? {
                        ...info,
                        logoUrl: resolveAdminAssetUrl(info.logoUrl) || "",
                        faviconUrl: resolveAdminAssetUrl(info.faviconUrl) || "",
                        floatingContact: normalizeFloatingContactSettings(info.floatingContact),
                    }
                    : info,
            });
        }

        if (type === "seo") {
            const settings = await getSeoSettings();
            return NextResponse.json({
                success: true,
                seoSettings: {
                    ...settings,
                    ogImageUrl: resolveAdminAssetUrl(settings.ogImageUrl) || "",
                },
            });
        }

        if (type === "announcement") {
            const settings = await getAnnouncementBarSettings();
            return NextResponse.json({ success: true, announcementSettings: settings });
        }

        if (type === "marquee") {
            const settings = await getMarqueeSettings();
            return NextResponse.json({ success: true, marqueeSettings: settings });
        }

        if (type === "ai") {
            const aiSettings = await getAIProviderSettings();
            const hasEnvKey = Boolean(process.env.GEMINI_API_KEY);

            return NextResponse.json({
                success: true,
                aiSettings: aiSettings ? {
                    provider: aiSettings.provider,
                    apiKey: redactStoredSecret(aiSettings.apiKey),
                    model: aiSettings.model,
                } : null,
                hasEnvKey,
            }, { headers: privateSettingsHeaders });
        }

        if (type === "translation") {
            const translationSettings = await getTranslationSettings();
            return NextResponse.json({
                success: true,
                translationSettings: { ...translationSettings, apiKey: redactStoredSecret(translationSettings.apiKey) },
                hasEnvKey: Boolean(process.env.DEEPL_API_KEY),
            }, { headers: privateSettingsHeaders });
        }

        if (type === "notification") {
            const notificationSettings = await getNotificationSettings();
            return NextResponse.json({
                success: true,
                notificationSettings: redactNotificationSettings(notificationSettings),
            }, { headers: privateSettingsHeaders });
        }

        if (!type && key && editableContentKeys.includes(key)) {
            const value = await getSetting(key);
            return NextResponse.json({
                success: true,
                setting: {
                    key,
                    value: key === "hero_banners" ? normalizeHeroBannersForAdmin(value) : value,
                },
            });
        }

        return NextResponse.json({ success: false, error: "Ayar bulunamadı." }, { status: 404 });
    } catch (error) {
        console.error("Error fetching settings:", error);
        return NextResponse.json(
            { success: false, error: "Ayarlar alınamadı." },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
            return NextResponse.json({ success: false, error: "Geçersiz ayar." }, { status: 400 });
        }

        const {
            type,
            key,
            value,
            paymentMethods,
            shippingOptions,
            shippingIntegrations,
            storeInfo,
            seoSettings,
            announcementSettings,
            marqueeSettings,
            aiSettings,
            translationSettings,
        } = body;
        const contentWrite = type ? editableContentTypes.includes(type) : editableContentKeys.includes(key ?? "");
        const denied = await requireLegacyAdminApi(request, contentWrite ? "admin" : "settings");
        if (denied) return denied;

        if (type === "payment" && paymentMethods !== undefined) {
            await setPaymentMethods(paymentMethods);
            return NextResponse.json({ success: true, message: "Payment methods updated" });
        }

        if (type === "shipping" && shippingOptions !== undefined) {
            await setShippingOptions(shippingOptions);
            return NextResponse.json({
                success: true,
                message: "Shipping options updated",
                shippingOptions: await getShippingOptions(),
            });
        }

        if (type === "shipping-integrations" && shippingIntegrations !== undefined) {
            const parsed = shippingIntegrationSettingsSchema.safeParse(shippingIntegrations);

            if (!parsed.success) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Geçersiz kargo entegrasyon verisi",
                        details: parsed.error.flatten(),
                    },
                    { status: 422 },
                );
            }

            const normalized = normalizeShippingIntegrationSettings(parsed.data);
            const resolved = restoreShippingIntegrations(normalized, await getShippingIntegrations());
            await setShippingIntegrations(resolved);
            return NextResponse.json({
                success: true,
                message: "Shipping integrations updated",
                shippingIntegrations: redactShippingIntegrations(resolved),
            }, { headers: privateSettingsHeaders });
        }

        if (type === "store" && storeInfo !== undefined) {
            await setStoreInfo({
                ...storeInfo,
                logoUrl: extractAdminStoredAssetUrl(storeInfo.logoUrl),
                faviconUrl: extractAdminStoredAssetUrl(storeInfo.faviconUrl),
                floatingContact: normalizeFloatingContactSettings(storeInfo.floatingContact),
            });
            return NextResponse.json({ success: true, message: "Store info updated" });
        }

        if (type === "seo" && seoSettings !== undefined) {
            await setSeoSettings({
                ...seoSettings,
                ogImageUrl: extractAdminStoredAssetUrl(seoSettings.ogImageUrl),
            });
            return NextResponse.json({ success: true, message: "SEO settings updated" });
        }

        if (type === "announcement" && announcementSettings !== undefined) {
            await setAnnouncementBarSettings(announcementSettings);
            return NextResponse.json({ success: true, message: "Announcement bar updated" });
        }

        if (type === "marquee" && marqueeSettings !== undefined) {
            await setMarqueeSettings(marqueeSettings);
            return NextResponse.json({ success: true, message: "Marquee settings updated" });
        }

        if (type === "ai" && aiSettings !== undefined) {
            await setAIProviderSettings(await restoreAISettings(aiSettings));
            return NextResponse.json({ success: true, message: "AI provider settings updated" });
        }

        if (type === "ai-test" && aiSettings !== undefined) {
            const resolved = await restoreAISettings(aiSettings);
            const testResult = await testAIConnection(resolved);
            return NextResponse.json({
                success: true,
                testResult: {
                    success: testResult.success,
                    message: testResult.success ? "Bağlantı doğrulandı." : "Bağlantı doğrulanamadı.",
                },
            }, { headers: privateSettingsHeaders });
        }

        if (type === "translation" && translationSettings !== undefined) {
            const current = await getTranslationSettings();
            await setTranslationSettings({
                ...translationSettings,
                apiKey: restoreStoredSecret(translationSettings.apiKey, current.apiKey),
            });
            return NextResponse.json({ success: true, message: "Translation settings updated" });
        }

        if (type === "notification" && body.notificationSettings !== undefined) {
            await setNotificationSettings(restoreNotificationSettings(
                body.notificationSettings,
                await getNotificationSettings(),
            ));
            return NextResponse.json({ success: true, message: "Notification settings updated" });
        }

        if (!type && editableContentKeys.includes(key) && value !== undefined) {
            const normalizedValue = key === "hero_banners" ? extractHeroBannersForStorage(value) : value;
            const setting = await setSetting(key, normalizedValue);
            return NextResponse.json({ success: true, setting });
        }

        return NextResponse.json(
            { success: false, error: "Invalid request body" },
            { status: 400 },
        );
    } catch (error) {
        console.error("Error updating settings:", error);
        return NextResponse.json(
            { success: false, error: "Ayarlar güncellenemedi." },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const denied = await requireLegacyAdminApi(request, "settings");
        if (denied) return denied;

        const { searchParams } = new URL(request.url);
        const key = searchParams.get("key");

        if (!key || !editableContentKeys.includes(key)) {
            return NextResponse.json(
                { success: false, error: "Setting key is required" },
                { status: 400 },
            );
        }

        await deleteSetting(key);
        return NextResponse.json({ success: true, message: "Setting deleted" });
    } catch (error) {
        console.error("Error deleting setting:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to delete setting" },
            { status: 500 },
        );
    }
}
