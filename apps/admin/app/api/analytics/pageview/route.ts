import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { deleteCachedValue } from "@/lib/cache/memory-cache";
import { isAnalyticsAdminPath, updateActivePresencePath } from "@/lib/analytics-presence";
import {
  DERYCRAFT_TEMPORARILY_DISABLED_CODE,
  isAdminAnalyticsWriteDisabled,
} from "@/lib/light-postgres-readiness";

// POST /api/analytics/pageview - Track page view
export async function POST(request: NextRequest) {
  if (isAdminAnalyticsWriteDisabled()) {
    return NextResponse.json({ success: true, disabled: true, code: DERYCRAFT_TEMPORARILY_DISABLED_CODE });
  }

  try {
    let body: { sessionId?: string; pageUrl?: string; pageTitle?: string } = {};

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: true });
    }

    const { sessionId, pageUrl, pageTitle } = body;

    if (!sessionId || !pageUrl) {
      return NextResponse.json({ success: true });
    }

    if (isAnalyticsAdminPath(pageUrl)) {
      return NextResponse.json({ success: true, filtered: true });
    }

    await updateActivePresencePath(sessionId, pageUrl);

    const supabase = createServerClient();

    try {
      await supabase.from("page_views").insert({
        session_id: sessionId,
        page_url: pageUrl,
        page_title: pageTitle || "",
        created_at: new Date().toISOString(),
      });
    } catch {}

    try {
      await supabase.rpc("increment_page_views", { p_session_id: sessionId });
    } catch {}

    deleteCachedValue("analytics:live:v2");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Page view tracking error:", error);
    return NextResponse.json({ success: true });
  }
}
