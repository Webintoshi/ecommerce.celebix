import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getAdminNotificationStatus } from "@/lib/admin-notification-center";

export async function GET() {
    try {
        const auth = await requireAdminAuth("/admin");
        const status = await getAdminNotificationStatus(auth.profile.id);

        return NextResponse.json({
            success: true,
            ...status,
        });
    } catch (error) {
        console.error("Admin notification status error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Bildirim durumu alinamadi.",
            },
            { status: 500 },
        );
    }
}
