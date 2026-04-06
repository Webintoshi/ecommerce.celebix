import "server-only";

import { createServerClient } from "@/lib/supabase";
import { getOrSetCachedValue } from "@/lib/cache/memory-cache";
import type { LiveAnalyticsEvent, LiveAnalyticsSnapshot } from "@/lib/admin-data-types";
import { syncAbandonedCartStatuses } from "@/lib/db/abandoned-carts";

const BOT_USER_AGENTS = [
  "bot",
  "spider",
  "crawler",
  "googlebot",
  "bingbot",
  "yandex",
  "duckduckbot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "telegrambot",
  "applebot",
  "semrush",
  "ahrefs",
  "mj12bot",
  "dotbot",
  "rogerbot",
  "screaming frog",
];

function isBot(userAgent: string | undefined) {
  if (!userAgent) return false;
  const normalizedUserAgent = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => normalizedUserAgent.includes(bot));
}

function isAdminPath(path: string) {
  if (!path) return false;

  const normalizedPath = path.toLowerCase();
  return (
    normalizedPath.startsWith("/admin") ||
    normalizedPath.startsWith("/api") ||
    normalizedPath.startsWith("/_")
  );
}

type SessionRow = {
  session_id: string;
  user_agent: string | null;
  device_type: string | null;
};

type PageViewRow = {
  page_url: string;
  session_id: string;
};

type EventRow = {
  event_type: string;
  event_data: Record<string, unknown> | null;
  page_url: string | null;
  created_at: string;
};

export async function getLiveAnalyticsSnapshot(): Promise<LiveAnalyticsSnapshot> {
  return getOrSetCachedValue("analytics:live:v2", 5_000, async () => {
    const supabase = createServerClient();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await syncAbandonedCartStatuses(supabase);

    const { data: activeSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("session_id,user_agent,device_type")
      .gte("last_activity_at", fiveMinutesAgo)
      .eq("is_active", true);

    if (sessionsError) {
      return {
        liveVisitors: 0,
        devices: { mobile: 0, desktop: 0, tablet: 0 },
        topPages: [],
        abandonedCarts: { count: 0, total: 0 },
        today: { addToCart: 0, purchases: 0 },
        recentEvents: [],
      };
    }

    let recentPageViews: PageViewRow[] = [];
    try {
      const pageViewResponse = await supabase
        .from("page_views")
        .select("page_url,session_id")
        .gte("created_at", tenMinutesAgo)
        .order("created_at", { ascending: false })
        .limit(250);

      recentPageViews = (pageViewResponse.data || []) as PageViewRow[];
    } catch {
      recentPageViews = [];
    }

    const humanSessions = ((activeSessions || []) as SessionRow[]).filter(
      (session) => !isBot(session.user_agent || undefined)
    );

    const humanSessionIds = new Set(
      humanSessions.map((session) => session.session_id)
    );

    const pageGroups: Record<string, number> = {};
    recentPageViews
      .filter((pageView) => !isAdminPath(pageView.page_url))
      .filter((pageView) => humanSessionIds.has(pageView.session_id))
      .forEach((pageView) => {
        pageGroups[pageView.page_url] = (pageGroups[pageView.page_url] || 0) + 1;
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
      .eq("status", "abandoned")
      .eq("recovered", false)
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

    const abandonedTotal = abandonedCarts.reduce(
      (sum, cart) => sum + Number(cart.total || 0),
      0
    );

    let addToCartCount = 0;
    let purchaseCount = 0;
    let recentEvents: LiveAnalyticsEvent[] = [];

    try {
      const { data: todayEvents } = await supabase
        .from("events")
        .select("event_type")
        .gte("created_at", oneDayAgo);

      addToCartCount =
        todayEvents?.filter((event) => event.event_type === "add_to_cart").length || 0;
      purchaseCount =
        todayEvents?.filter((event) => event.event_type === "purchase").length || 0;
    } catch {
      addToCartCount = 0;
      purchaseCount = 0;
    }

    try {
      const { data: recentEventRows } = await supabase
        .from("events")
        .select("event_type,event_data,page_url,created_at")
        .gte("created_at", thirtyMinutesAgo)
        .order("created_at", { ascending: false })
        .limit(20);

      recentEvents = ((recentEventRows || []) as EventRow[])
        .filter((event) => !isAdminPath(event.page_url || ""))
        .map((event) => ({
          type: event.event_type,
          data: event.event_data || {},
          pageUrl: event.page_url || "",
          createdAt: event.created_at,
        }));
    } catch {
      recentEvents = [];
    }

    return {
      liveVisitors: humanSessions.length,
      devices: {
        mobile:
          humanSessions.filter((session) => session.device_type === "mobile").length || 0,
        desktop:
          humanSessions.filter((session) => session.device_type === "desktop").length || 0,
        tablet:
          humanSessions.filter((session) => session.device_type === "tablet").length || 0,
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
      recentEvents,
    };
  });
}
