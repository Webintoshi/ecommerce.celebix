import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

function isAdminPath(path: string): boolean {
    if (!path) return false;
    const lowerPath = path.toLowerCase();
    return lowerPath.startsWith('/admin') || 
           lowerPath.startsWith('/api') || 
           lowerPath.startsWith('/_');
}

// POST /api/analytics/pageview - Track page view
export async function POST(request: NextRequest) {
    try {
        let body: { sessionId?: string; pageUrl?: string; pageTitle?: string } = {};
        
        // Safely parse JSON body
        try {
            body = await request.json();
        } catch {
            // Invalid JSON body - silently fail
            return NextResponse.json({ success: true });
        }
        
        const { sessionId, pageUrl, pageTitle } = body;

        if (!sessionId || !pageUrl) {
            // Missing required fields - silently fail
            return NextResponse.json({ success: true });
        }

        if (isAdminPath(pageUrl)) {
            return NextResponse.json({ success: true, filtered: true });
        }

        const supabase = createServerClient();

        // Insert page view - ignore errors
        try {
            await supabase.from("page_views").insert({
                session_id: sessionId,
                page_url: pageUrl,
                page_title: pageTitle || "",
                created_at: new Date().toISOString(),
            });
        } catch {
            // Ignore insert errors
        }

        // Increment session page views - ignore errors
        try {
            await supabase.rpc("increment_page_views", { p_session_id: sessionId });
        } catch {
            // Ignore RPC errors
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Page view tracking error:", error);
        // Don't fail the page load if tracking fails
        return NextResponse.json({ success: true });
    }
}
