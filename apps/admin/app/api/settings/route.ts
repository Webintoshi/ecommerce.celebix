import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { testAIConnection } from "@/lib/ai";
import {
    SHIPPING_PROVIDER_REGISTRY,
    normalizeShippingIntegrationSettings,
} from "@/lib/shipping-integrations";
import {
    deleteSetting,
    getAIProviderSettings,
    getAllSettings,
    getAnnouncementBarSettings,
    getMarqueeSettings,
    getPaymentMethods,
    getSetting,
    getShippingIntegrations,
    getShippingOptions,
    getStoreInfo,
    setAIProviderSettings,
    setAnnouncementBarSettings,
    setMarqueeSettings,
    setPaymentMethods,
    setSetting,
    setShippingIntegrations,
    setShippingOptions,
    setStoreInfo,
} from "@/lib/db/settings";

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

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get("key");
        const type = searchParams.get("type");

        if (type === "payment") {
            const methods = await getPaymentMethods();
            return NextResponse.json({ success: true, paymentMethods: methods });
        }

        if (type === "shipping") {
            const options = await getShippingOptions();
            return NextResponse.json({ success: true, shippingOptions: options });
        }

        if (type === "shipping-integrations") {
            const integrations = await getShippingIntegrations();
            return NextResponse.json({ success: true, shippingIntegrations: integrations });
        }

        if (type === "store") {
            const info = await getStoreInfo();
            return NextResponse.json({ success: true, storeInfo: info });
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
                    apiKey: aiSettings.apiKey,
                    model: aiSettings.model,
                } : null,
                hasEnvKey,
            });
        }

        if (key) {
            const value = await getSetting(key);
            return NextResponse.json({ success: true, setting: { key, value } });
        }

        const settings = await getAllSettings();
        return NextResponse.json({ success: true, settings });
    } catch (error) {
        console.error("Error fetching settings:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch settings" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            type,
            key,
            value,
            paymentMethods,
            shippingOptions,
            shippingIntegrations,
            storeInfo,
            announcementSettings,
            marqueeSettings,
            aiSettings,
        } = body;

        if (type === "payment" && paymentMethods !== undefined) {
            await setPaymentMethods(paymentMethods);
            return NextResponse.json({ success: true, message: "Payment methods updated" });
        }

        if (type === "shipping" && shippingOptions !== undefined) {
            await setShippingOptions(shippingOptions);
            return NextResponse.json({ success: true, message: "Shipping options updated" });
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
            await setShippingIntegrations(normalized);
            return NextResponse.json({
                success: true,
                message: "Shipping integrations updated",
                shippingIntegrations: normalized,
            });
        }

        if (type === "store" && storeInfo !== undefined) {
            await setStoreInfo(storeInfo);
            return NextResponse.json({ success: true, message: "Store info updated" });
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
            await setAIProviderSettings(aiSettings);
            return NextResponse.json({ success: true, message: "AI provider settings updated" });
        }

        if (type === "ai-test" && aiSettings !== undefined) {
            const testResult = await testAIConnection(aiSettings);
            return NextResponse.json({ success: true, testResult });
        }

        if (key && value !== undefined) {
            const setting = await setSetting(key, value);
            return NextResponse.json({ success: true, setting });
        }

        return NextResponse.json(
            { success: false, error: "Invalid request body" },
            { status: 400 },
        );
    } catch (error) {
        console.error("Error updating settings:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to update settings" },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get("key");

        if (!key) {
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
