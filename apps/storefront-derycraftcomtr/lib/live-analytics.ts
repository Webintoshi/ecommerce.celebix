import "server-only";

import { createServerClient } from "@/lib/supabase";
import { getOrSetCachedValue } from "@/lib/cache/memory-cache";
import {
  getActivePresenceSnapshot,
  isAnalyticsAdminPath,
  isAnalyticsBot,
} from "@/lib/analytics-presence";
import { syncAbandonedCartStatuses } from "@/lib/db/abandoned-carts";
import { shouldUseLightPostgresStorefront } from "@/lib/db/storefront-database-mode";

const LIVE_CACHE_KEY = "analytics:live:v1";
const LIVE_WINDOW_MS = 5 * 60 * 1000;
const RECENT_PAGES_WINDOW_MS = 10 * 60 * 1000;

type LiveAnalyticsPayload = {
  success: true;
  data: {
    liveVisitors: number;
    devices: {
      mobile: number;
      desktop: number;
      tablet: number;
    };
    topPages: Array<{ url: string; count: number }>;
    abandonedCarts: {
      count: number;
      total: number;
    };
    today: {
      addToCart: number;
      purchases: number;
    };
  };
};

type SessionRow = {
  session_id: string;
  user_agent: string | null;
  device_type: string | null;
};

type PageViewRow = {
  page_url: string;
  session_id: string;
};

export async function getLiveAnalyticsSnapshot(): Promise<LiveAnalyticsPayload> {
  return getOrSetCachedValue(LIVE_CACHE_KEY, 5_000, async () => {
    if (shouldUseLightPostgresStorefront()) {
      const presenceSnapshot = await getActivePresenceSnapshot();

      return {
        success: true,
        data: {
          liveVisitors: presenceSnapshot?.liveVisitors ?? 0,
          devices: presenceSnapshot?.devices ?? { mobile: 0, desktop: 0, tablet: 0 },
          topPages: presenceSnapshot?.topPages ?? [],
          abandonedCarts: {
            count: 0,
            total: 0,
          },
          today: {
            addToCart: 0,
            purchases: 0,
          },
        },
      };
    }

    const supabase = createServerClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const getDatabasePresenceSnapshot = async () => {
      const fiveMinutesAgo = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
      const tenMinutesAgo = new Date(Date.now() - RECENT_PAGES_WINDOW_MS).toISOString();

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
        (session) => !isAnalyticsBot(session.user_agent || undefined),
      );

      const humanSessionIds = new Set(humanSessions.map((session) => session.session_id));
      const pageGroups: Record<string, number> = {};

      recentPageViews
        .filter((pageView) => !isAnalyticsAdminPath(pageView.page_url))
        .filter((pageView) => humanSessionIds.has(pageView.session_id))
        .forEach((pageView) => {
          pageGroups[pageView.page_url] = (pageGroups[pageView.page_url] || 0) + 1;
        });

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
        topPages: Object.entries(pageGroups)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([url, count]) => ({ url, count })),
      };
    };

    await syncAbandonedCartStatuses(supabase);

    const presenceSnapshot =
      (await getActivePresenceSnapshot()) ?? (await getDatabasePresenceSnapshot());

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
      0,
    );

    let addToCartCount = 0;
    let purchaseCount = 0;
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

    return {
      success: true,
      data: {
        liveVisitors: presenceSnapshot.liveVisitors,
        devices: presenceSnapshot.devices,
        topPages: presenceSnapshot.topPages,
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
}
