import { NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || "11244612690";

function createAnalyticsClient(): BetaAnalyticsDataClient {
  const jsonCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.GA4_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
  const clientEmail = process.env.GA4_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let credentials: any;

  if (jsonCredentials) {
    try {
      credentials = JSON.parse(jsonCredentials);
      // Fix escaped newlines in private key (common in Docker/Dokploy env vars)
      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      console.log("[GA4] Using JSON credentials, project:", credentials.project_id, "email:", credentials.client_email);
    } catch (e) {
      console.error("[GA4] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", e);
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON could not be parsed as JSON");
    }
  } else if (projectId && clientEmail && privateKey) {
    credentials = {
      type: "service_account",
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
    console.log("[GA4] Using separate env vars, project:", projectId);
  } else {
    const envCheck = {
      GOOGLE_SERVICE_ACCOUNT_JSON: !!jsonCredentials,
      GA4_PROJECT_ID: !!projectId,
      GA4_CLIENT_EMAIL: !!clientEmail,
      GA4_PRIVATE_KEY: !!privateKey,
    };
    console.error("[GA4] No credentials found. Env check:", envCheck);
    throw new Error(`GA4 credentials not configured. Available: ${JSON.stringify(envCheck)}`);
  }

  return new BetaAnalyticsDataClient({ credentials });
}

export async function GET() {
  try {
    // Create a fresh client on each request (avoids stale/broken cached clients)
    const client = createAnalyticsClient();

    const [realtimeReport] = await client.runRealtimeReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      dimensions: [{ name: "unifiedScreenName" }],
      metrics: [{ name: "activeUsers" }],
    });

    const [deviceReport] = await client.runRealtimeReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      metrics: [{ name: "activeUsers" }],
      dimensions: [{ name: "deviceCategory" }],
    });

    const totalUsers = deviceReport.rows?.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, row: any) => sum + Number(row.metricValues[0]?.value || 0),
      0
    ) || 0;

    const devices = { mobile: 0, desktop: 0, tablet: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deviceReport.rows?.forEach((row: any) => {
      const deviceType = row.dimensionValues[0]?.value?.toLowerCase() || "desktop";
      const count = Number(row.metricValues[0]?.value || 0);
      if (deviceType.includes("mobile")) devices.mobile += count;
      else if (deviceType.includes("tablet")) devices.tablet += count;
      else devices.desktop += count;
    });

    const pageGroups: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtimeReport.rows?.forEach((row: any) => {
      const pageUrl = row.dimensionValues[0]?.value || "/";
      const count = Number(row.metricValues[0]?.value || 0);
      pageGroups[pageUrl] = (pageGroups[pageUrl] || 0) + count;
    });

    const topPages = Object.entries(pageGroups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([url, count]) => ({ url, count }));

    return NextResponse.json({
      success: true,
      data: { liveVisitors: totalUsers, devices, topPages },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined;
    console.error("[GA4] API Error:", message, stack);
    return NextResponse.json(
      {
        success: false,
        error: message,
        hint: message.includes("DECODER")
          ? "Private key format issue - check GOOGLE_SERVICE_ACCOUNT_JSON env var"
          : message.includes("not configured")
            ? "Set GOOGLE_SERVICE_ACCOUNT_JSON in Dokploy environment variables"
            : undefined
      },
      { status: 500 }
    );
  }
}
