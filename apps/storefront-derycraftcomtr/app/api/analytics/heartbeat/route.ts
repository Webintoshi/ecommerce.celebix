import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { deleteCachedValue, getOrSetCachedValue } from "@/lib/cache/memory-cache";
import { getActivePresenceSnapshot, isAnalyticsAdminPath, isAnalyticsBot, upsertActivePresence } from "@/lib/analytics-presence";
import { isDerycraftLightPostgresRuntime } from "@/lib/derycraft-light-postgres";

function isAdminPath(path: string): boolean {
    return isAnalyticsAdminPath(path);
}

async function getDatabaseVisitorCount() {
    const supabase = createServerClient();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: sessions } = await supabase
        .from("sessions")
        .select("user_agent")
        .gte("last_activity_at", fiveMinutesAgo)
        .eq("is_active", true);

    const humanSessions = (sessions || []).filter((session) => !isAnalyticsBot(session.user_agent));
    return humanSessions.length;
}

export async function POST(request: NextRequest) {
    if (isDerycraftLightPostgresRuntime()) {
        return NextResponse.json({ success: true, updated: false, disabled: true });
    }

    try {
        let body = { sessionId: '', path: '', userAgent: '', deviceType: '' };
        
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: true, visitors: 0 });
        }
        
        const { sessionId, userAgent, path, deviceType } = body;

        if (!sessionId) {
            return NextResponse.json({ success: true, visitors: 0 });
        }

        if (isAnalyticsBot(userAgent)) {
            return NextResponse.json({ success: true, visitors: 0, bot: true });
        }

        if (path && isAdminPath(path)) {
            return NextResponse.json({ success: true, visitors: 0, admin: true });
        }

        const presenceState = await upsertActivePresence({
            sessionId,
            path,
            userAgent,
            deviceType,
        });

        if (presenceState.shouldPersistSession) {
            const supabase = createServerClient();

            try {
                const { data: existing } = await supabase
                    .from("sessions")
                    .select("id")
                    .eq("session_id", sessionId)
                    .single();

                if (existing) {
                    await supabase
                        .from("sessions")
                        .update({
                            last_activity_at: new Date().toISOString(),
                            is_active: true,
                            ...(userAgent ? { user_agent: userAgent } : {}),
                            ...(deviceType ? { device_type: deviceType } : {}),
                        })
                        .eq("session_id", sessionId);
                } else {
                    await supabase.from("sessions").insert({
                        session_id: sessionId,
                        user_agent: userAgent || 'Unknown',
                        device_type: deviceType || 'desktop',
                        started_at: new Date().toISOString(),
                        last_activity_at: new Date().toISOString(),
                        is_active: true,
                        page_views: 1,
                    });
                }
            } catch {}
        }

        deleteCachedValue("analytics:live:v1");
        deleteCachedValue("analytics:heartbeat:visitors");

        return NextResponse.json({
            success: true,
            updated: true,
        });
    } catch (error) {
        console.error("Heartbeat error:", error);
        return NextResponse.json({ success: true, updated: false });
    }
}

export async function GET() {
    if (isDerycraftLightPostgresRuntime()) {
        const snapshot = await getActivePresenceSnapshot();
        return NextResponse.json({
            success: true,
            visitors: snapshot?.liveVisitors ?? 0,
            disabled: true,
        });
    }

    try {
        const visitors = await getOrSetCachedValue("analytics:heartbeat:visitors", 3_000, async () => {
            const presenceSnapshot = await getActivePresenceSnapshot();
            if (presenceSnapshot) {
                return presenceSnapshot.liveVisitors;
            }

            return getDatabaseVisitorCount();
        });

        return NextResponse.json({
            success: true,
            visitors,
        });
    } catch (error) {
        console.error("Heartbeat GET error:", error);
        return NextResponse.json({ success: true, visitors: 0 });
    }
}
