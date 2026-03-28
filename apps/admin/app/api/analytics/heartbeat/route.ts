import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getOrSetCachedValue } from "@/lib/cache/memory-cache";

const BOT_USER_AGENTS = [
    'bot', 'spider', 'crawler', 'googlebot', 'bingbot', 'yandex', 'duckduckbot',
    'facebookexternalhit', 'twitterbot', 'linkedinbot', 'slackbot', 'telegrambot',
    'applebot', 'semrush', 'ahrefs', 'mj12bot', 'dotbot', 'rogerbot', 'screaming frog'
];

function isBot(userAgent: string | undefined): boolean {
    if (!userAgent) return false;
    const ua = userAgent.toLowerCase();
    return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

function isAdminPath(path: string): boolean {
    if (!path) return false;
    const lowerPath = path.toLowerCase();
    return lowerPath.startsWith('/admin') || 
           lowerPath.startsWith('/api') || 
           lowerPath.startsWith('/_');
}

export async function POST(request: NextRequest) {
    try {
        let body = { sessionId: '', path: '', userAgent: '' };
        
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: true, visitors: 0 });
        }
        
        const { sessionId, userAgent, path } = body;

        if (!sessionId) {
            return NextResponse.json({ success: true, visitors: 0 });
        }

        if (isBot(userAgent)) {
            return NextResponse.json({ success: true, visitors: 0, bot: true });
        }

        if (path && isAdminPath(path)) {
            return NextResponse.json({ success: true, visitors: 0, admin: true });
        }

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
                        is_active: true
                    })
                    .eq("session_id", sessionId);
            } else {
                await supabase.from("sessions").insert({
                    session_id: sessionId,
                    user_agent: userAgent || 'Unknown',
                    device_type: 'desktop',
                    started_at: new Date().toISOString(),
                    last_activity_at: new Date().toISOString(),
                    is_active: true,
                    page_views: 1,
                });
            }
        } catch {}

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
    try {
        const visitors = await getOrSetCachedValue("analytics:heartbeat:visitors", 5_000, async () => {
            const supabase = createServerClient();
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data: sessions } = await supabase
                .from("sessions")
                .select("user_agent")
                .gte("last_activity_at", fiveMinutesAgo)
                .eq("is_active", true);

            const humanSessions = (sessions || []).filter((s) => !isBot(s.user_agent));
            return humanSessions.length;
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
