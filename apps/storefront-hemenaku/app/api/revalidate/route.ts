import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/**
 * POST /api/revalidate
 * 
 * Body: { path: string }
 * 
 * Triggers on-demand revalidation for a specific path.
 * Used by admin panel to instantly update category/product pages after SEO edits.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { path } = body;

        // Validate path
        if (!path || typeof path !== "string") {
            return NextResponse.json(
                { success: false, error: "Path is required" },
                { status: 400 }
            );
        }

        // Security: Only allow revalidation of specific paths
        const allowedPrefixes = ["/koleksiyon/", "/urun/", "/urunler/", "/"];
        const isAllowed = allowedPrefixes.some(prefix => path.startsWith(prefix));
        
        if (!isAllowed) {
            return NextResponse.json(
                { success: false, error: "Path not allowed for revalidation" },
                { status: 403 }
            );
        }

        // Trigger revalidation
        revalidatePath(path);

        return NextResponse.json({
            success: true,
            message: `Revalidated: ${path}`,
            revalidated: true,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Revalidation error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to revalidate" },
            { status: 500 }
        );
    }
}
