import { NextRequest, NextResponse } from "next/server";
import { deleteFromR2 } from "@/lib/r2";
import { requireLegacyAdminApi } from "@/lib/legacy-admin-api-auth";

export async function DELETE(request: NextRequest) {
    const denied = await requireLegacyAdminApi(request, "settings");
    if (denied) return denied;
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get("key");

        if (!key || key.length > 512 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/\d{13}-[a-zA-Z0-9._-]+$/.test(key)) {
            return NextResponse.json(
                { success: false, error: "No key provided" },
                { status: 400 }
            );
        }

        const success = await deleteFromR2(key);

        if (success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json(
                { success: false, error: "Delete failed" },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("Delete API error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
