import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/analytics/event - Track custom event
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, eventType, eventData, pageUrl } = body;

        if (!sessionId || !eventType) {
            return NextResponse.json({ success: false, error: "Session ID and event type required" }, { status: 400 });
        }

        const supabase = createServerClient();

        // Insert event
        await supabase.from("events").insert({
            session_id: sessionId,
            event_type: eventType,
            event_data: eventData || {},
            page_url: pageUrl,
            created_at: new Date().toISOString(),
        });

        // Update session activity
        await supabase
            .from("sessions")
            .update({ last_activity_at: new Date().toISOString(), is_active: true })
            .eq("session_id", sessionId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Event tracking error:", error);
        return NextResponse.json({ success: true });
    }
}
