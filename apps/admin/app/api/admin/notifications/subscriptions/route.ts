import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import {
    disableAdminPushSubscription,
    registerAdminPushSubscription,
} from "@/lib/admin-notification-center";

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdminAuth("/admin");
        const body = (await request.json()) as {
            endpoint?: string;
            p256dh?: string;
            auth?: string;
            userAgent?: string;
            platform?: string;
        };

        if (!body.endpoint || !body.p256dh || !body.auth) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Gecerli push subscription verisi gerekli.",
                },
                { status: 400 },
            );
        }

        const subscription = await registerAdminPushSubscription(auth.profile.id, {
            endpoint: body.endpoint,
            p256dh: body.p256dh,
            auth: body.auth,
            userAgent: body.userAgent || null,
            platform: body.platform || null,
        });

        return NextResponse.json({
            success: true,
            subscription,
        });
    } catch (error) {
        console.error("Admin push subscription register error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Push aboneligi kaydedilemedi.",
            },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAdminAuth("/admin");
        const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
        const endpoint =
            body?.endpoint ||
            new URL(request.url).searchParams.get("endpoint") ||
            "";

        if (!endpoint) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Silinecek endpoint gerekli.",
                },
                { status: 400 },
            );
        }

        await disableAdminPushSubscription(auth.profile.id, endpoint);

        return NextResponse.json({
            success: true,
        });
    } catch (error) {
        console.error("Admin push subscription disable error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Push aboneligi kaldirilamadi.",
            },
            { status: 500 },
        );
    }
}
