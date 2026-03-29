import { NextResponse } from "next/server";
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

export async function GET() {
    try {
        const payload = await getOrSetCachedValue("analytics:live:v1", 8_000, async () => {
            const supabase = createServerClient();
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            const { data: activeSessions, error: sessionsError } = await supabase
                .from("sessions")
                .select("session_id,user_agent,device_type")
                .gte("last_activity_at", fiveMinutesAgo)
                .eq("is_active", true);

            if (sessionsError) {
                return {
                    success: true,
                    data: {
                        liveVisitors: 0,
                        devices: { mobile: 0, desktop: 0, tablet: 0 },
                        topPages: [],
                        abandonedCarts: { count: 0, total: 0 },
                        today: { addToCart: 0, purchases: 0 },
                    },
                };
            }

            let recentPageViews: { page_url: string; session_id: string }[] = [];
            try {
                const pageViewResponse = await supabase
                    .from("page_views")
                    .select("page_url,session_id")
                    .gte("created_at", fiveMinutesAgo)
                    .order("created_at", { ascending: false })
                    .limit(100);
                recentPageViews = pageViewResponse.data || [];
            } catch {
                recentPageViews = [];
            }

            const nonAdminPageViews = recentPageViews.filter((pv) => !isAdminPath(pv.page_url));
            const nonAdminSessionIds = new Set(nonAdminPageViews.map((pv) => pv.session_id));

            const humanSessions = (activeSessions || []).filter(
                (s) => !isBot(s.user_agent) && nonAdminSessionIds.has(s.session_id)
            );
            const humanCount = humanSessions.length;

            const mobileCount = humanSessions.filter((s) => s.device_type === "mobile").length || 0;
            const desktopCount = humanSessions.filter((s) => s.device_type === "desktop").length || 0;
            const tabletCount = humanSessions.filter((s) => s.device_type === "tablet").length || 0;

            const humanSessionIds = new Set(humanSessions.map((s) => s.session_id));
            const humanPageViews = nonAdminPageViews.filter((pv) => humanSessionIds.has(pv.session_id));

            const pageGroups: Record<string, number> = {};
            humanPageViews.forEach((pv) => {
                pageGroups[pv.page_url] = (pageGroups[pv.page_url] || 0) + 1;
            });

            const topPages = Object.entries(pageGroups)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([url, count]) => ({ url, count }));

            let abandonedCarts: { total: number | string | null; recovered?: boolean | null }[] = [];
            let abandonedCount = 0;

            const abandonedWithStatus = await supabase
                .from("abandoned_carts")
                .select("total", { count: "exact" })
                .eq("status", "active")
                .gte("created_at", oneDayAgo);

            if (!abandonedWithStatus.error) {
                abandonedCarts = abandonedWithStatus.data || [];
                abandonedCount = Number(abandonedWithStatus.count || 0);
            } else {
                const abandonedFallback = await supabase
                    .from("abandoned_carts")
                    .select("total,recovered", { count: "exact" })
                    .eq("recovered", false)
                    .gte("created_at", oneDayAgo);

                abandonedCarts = abandonedFallback.data || [];
                abandonedCount = Number(abandonedFallback.count || 0);
            }

            const abandonedTotal = abandonedCarts.reduce((sum, c) => sum + Number(c.total || 0), 0);

            let addToCartCount = 0;
            let purchaseCount = 0;
            try {
                const { data: todayEvents } = await supabase
                    .from("events")
                    .select("event_type")
                    .gte("created_at", oneDayAgo);

                addToCartCount = todayEvents?.filter((e) => e.event_type === "add_to_cart").length || 0;
                purchaseCount = todayEvents?.filter((e) => e.event_type === "purchase").length || 0;
            } catch {
                addToCartCount = 0;
                purchaseCount = 0;
            }

            return {
                success: true,
                data: {
                    liveVisitors: humanCount,
                    devices: {
                        mobile: mobileCount,
                        desktop: desktopCount,
                        tablet: tabletCount,
                    },
                    topPages,
                    abandonedCarts: {
                        count: abandonedCount || 0,
                        total: abandonedTotal,
                    },
                    today: {
                        addToCart: addToCartCount,
                        purchases: purchaseCount,
                    },
                },
            };
        });

        return NextResponse.json(payload);
    } catch (error) {
        console.error("Live analytics error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch live data" },
            { status: 500 }
        );
    }
}
