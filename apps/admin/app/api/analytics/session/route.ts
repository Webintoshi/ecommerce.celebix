import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { deleteCachedValue } from "@/lib/cache/memory-cache";
import { upsertActivePresence } from "@/lib/analytics-presence";
import {
  DERYCRAFT_TEMPORARILY_DISABLED_CODE,
  isAdminAnalyticsWriteDisabled,
} from "@/lib/light-postgres-readiness";

// POST /api/analytics/session - Create or update session
export async function POST(request: NextRequest) {
  if (isAdminAnalyticsWriteDisabled()) {
    return NextResponse.json({ success: true, disabled: true, code: DERYCRAFT_TEMPORARILY_DISABLED_CODE });
  }

  try {
    const body = await request.json();
    const {
      sessionId,
      userAgent,
      referrer,
      deviceType,
      browser,
      os,
      utm_source,
      utm_medium,
      utm_campaign,
      path,
    } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: "Session ID required" }, { status: 400 });
    }

    await upsertActivePresence({
      sessionId,
      path,
      userAgent,
      deviceType,
    });

    const supabase = createServerClient();

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
        })
        .eq("session_id", sessionId);
    } else {
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

    deleteCachedValue("analytics:live:v2");
    deleteCachedValue("analytics:heartbeat:visitors");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Session tracking error:", error);
    return NextResponse.json({ success: false, error: "Failed to track session" }, { status: 500 });
  }
}
