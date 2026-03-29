import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/analytics/session - Create or update session
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, userAgent, referrer, deviceType, browser, os, utm_source, utm_medium, utm_campaign } = body;

        if (!sessionId) {
            return NextResponse.json({ success: false, error: "Session ID required" }, { status: 400 });
        }

        const supabase = createServerClient();

        // Try to update existing session, or insert new one
        const { data: existing } = await supabase
            .from("sessions")
            .select("id")
            .eq("session_id", sessionId)
            .single();

        if (existing) {
            // Update last activity
            await supabase
                .from("sessions")
                .update({
                    last_activity_at: new Date().toISOString(),
                    is_active: true
                })
                .eq("session_id", sessionId);
        } else {
            // Create new session
            await supabase.from("sessions").insert({
                session_id: sessionId,
                user_agent: userAgent,
                referrer: referrer,
                device_type: deviceType,
                browser: browser,
                os: os,
                utm_source: utm_source,
                utm_medium: utm_medium,
                utm_campaign: utm_campaign,
                started_at: new Date().toISOString(),
                last_activity_at: new Date().toISOString(),
                is_active: true,
                page_views: 0,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Session tracking error:", error);
        return NextResponse.json({ success: false, error: "Failed to track session" }, { status: 500 });
    }
}
