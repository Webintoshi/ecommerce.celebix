import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { syncNewProductReviewNotifications } from "@/lib/admin-notification-center";

export async function POST() {
    try {
        await requireAdminAuth("/admin");
        const updated = await syncNewProductReviewNotifications();

        return NextResponse.json({
            success: true,
            updated,
        });
    } catch (error) {
        console.error("Admin notification sync error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Bildirim senkronu tamamlanamadi.",
            },
            { status: 500 },
        );
    }
}
