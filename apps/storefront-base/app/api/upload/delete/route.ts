import { NextRequest, NextResponse } from "next/server";
import { deleteFromR2 } from "@/lib/r2";

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get("key");

        if (!key) {
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
