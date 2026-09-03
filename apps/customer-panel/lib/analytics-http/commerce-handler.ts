import type { AnalyticsRange, TenantContext } from "@celebix/saas-contracts";
import { ANALYTICS_ERROR_CODES, AnalyticsRepositoryError } from "@celebix/saas-data";

import type { ServerAnalyticsRuntime } from "../server-analytics/runtime.ts";
import { authorizeAnalyticsRequest } from "./request-authority.ts";

const VIEWS = ["overview", "funnel", "abandoned-carts", "acquisition", "products", "status"] as const;
type View = typeof VIEWS[number];
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerAnalyticsRuntime | null>; now(): Date; requestId(): string }>;
type Range = Readonly<{ start: Date; end: Date; timezone: string; umamiRange: AnalyticsRange | null; label: string; compare: boolean }>;

function json(value: unknown, status = 200, headers?: HeadersInit) { const output = new Headers(headers); output.set("cache-control", "no-store"); output.set("x-content-type-options", "nosniff"); return Response.json(value, { status, headers: output }); }
function error(code: string, status: number, headers?: HeadersInit) { return json({ code }, status, headers); }
function isResponse(value: unknown): value is Response { return value instanceof Response; }
function repositoryError(value: unknown): Response { if (!(value instanceof AnalyticsRepositoryError) || !ANALYTICS_ERROR_CODES.includes(value.code)) return error("unavailable", 503); const status = value.code === "invalid_input" ? 400 : value.code === "unauthenticated" ? 401 : ["membership_denied", "store_inactive", "feature_not_enabled"].includes(value.code) ? 403 : value.code === "durable_authority_invalid" ? 409 : 503; return error(value.code, status); }

function range(request: Request, view: View, now: Date): Range | null {
  let url: URL; try { url = new URL(request.url); } catch { return null; }
  if (url.pathname !== `/api/analytics/${view}` || url.hash || url.username || url.password || url.search.length > 160) return null;
  const raw = url.search.slice(1);
  const preset = /^range=(today|7d|30d|90d)(?:&compare=(0|1))?$/.exec(raw);
  if (preset) {
    const label = preset[1]!;
    const days = label === "today" ? 1 : Number(label.slice(0, -1));
    const start = label === "today" ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) : new Date(now.getTime() - days * 86_400_000);
    return Object.freeze({ start, end: new Date(now), timezone: "Europe/Istanbul", umamiRange: label === "today" ? "7d" : label as AnalyticsRange, label, compare: preset[2] === "1" });
  }
  const custom = /^from=(\d{4}-\d{2}-\d{2})&to=(\d{4}-\d{2}-\d{2})&timezone=([A-Za-z_]+(?:%2F|\/)[A-Za-z_]+)$/i.exec(raw);
  if (!custom) return null;
  const start = new Date(`${custom[1]}T00:00:00.000Z`), requestedEnd = new Date(`${custom[2]}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(requestedEnd.getTime()) || start.toISOString().slice(0, 10) !== custom[1] || requestedEnd.toISOString().slice(0, 10) !== custom[2]) return null;
  const end = new Date(Math.min(now.getTime(), requestedEnd.getTime() + 86_400_000));
  let timezone: string; try { timezone = decodeURIComponent(custom[3]!); new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { return null; }
  if (start >= end || end > now || end.getTime() - start.getTime() > 400 * 86_400_000) return null;
  return Object.freeze({ start, end, timezone, umamiRange: null, label: `${custom[1]}:${custom[2]}`, compare: false });
}

async function authorized(dependencies: Dependencies, request: Request, view: View): Promise<Response | Readonly<{ runtime: ServerAnalyticsRuntime; tenantContext: TenantContext; now: Date; range: Range }>> {
  if (request.method !== "GET") return error("method_not_allowed", 405, { allow: "GET" });
  let runtime: ServerAnalyticsRuntime | null; try { runtime = await dependencies.resolveRuntime(); } catch { return error("unavailable", 503); }
  if (!runtime) return error("unavailable", 503);
  let now: Date, requestId: string; try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return error("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return error("unavailable", 503);
  const selected = range(request, view, now); if (!selected) return error("invalid_input", 400);
  const decision = await authorizeAnalyticsRequest(runtime, request, requestId, now, false);
  if (decision.kind === "response") { let body: unknown; try { body = await decision.response.json(); } catch { body = { code: "unavailable" }; } return json(body, decision.response.status); }
  return Object.freeze({ runtime, tenantContext: decision.tenantContext, now: new Date(now), range: selected });
}

export function createCommerceAnalyticsHttpHandlers(dependencies: Dependencies) {
  if (!dependencies || typeof dependencies.resolveRuntime !== "function" || typeof dependencies.now !== "function" || typeof dependencies.requestId !== "function") throw new Error("commerce_analytics_http_handler_invalid");
  const make = (view: View) => async (request: Request): Promise<Response> => {
    const context = await authorized(dependencies, request, view); if (isResponse(context)) return context;
    try {
      const commerce = await context.runtime.analytics.commerceSnapshot({ tenantContext: context.tenantContext, now: context.now, rangeStart: context.range.start, rangeEnd: context.range.end });
      const duration = context.range.end.getTime() - context.range.start.getTime();
      const comparisonCommerce = context.range.compare ? await context.runtime.analytics.commerceSnapshot({ tenantContext: context.tenantContext, now: context.now, rangeStart: new Date(context.range.start.getTime() - duration), rangeEnd: new Date(context.range.start) }) : null;
      let traffic: unknown = null, providerAvailable: boolean | null = null, degraded = false;
      if (view === "overview") {
        if (context.range.umamiRange === null) degraded = true;
        else try {
          const authority = await context.runtime.analytics.getConnectionAuthority({ tenantContext: context.tenantContext, now: context.now });
          const [summary, events] = await Promise.all([
            context.runtime.umami.summary({ websiteId: authority.websiteId, range: context.range.umamiRange, timezone: context.range.timezone, now: context.now }),
            context.runtime.umami.metrics({ websiteId: authority.websiteId, range: context.range.umamiRange, timezone: context.range.timezone, type: "event", now: context.now }),
          ]);
          traffic = Object.freeze({ summary, events }); providerAvailable = true;
        } catch { degraded = true; providerAvailable = false; }
      } else if (view === "funnel") {
        if (context.range.umamiRange === null) degraded = true;
        else try {
          const authority = await context.runtime.analytics.getConnectionAuthority({ tenantContext: context.tenantContext, now: context.now });
          const [summary, events] = await Promise.all([
            context.runtime.umami.summary({ websiteId: authority.websiteId, range: context.range.umamiRange, timezone: context.range.timezone, now: context.now }),
            context.runtime.umami.metrics({ websiteId: authority.websiteId, range: context.range.umamiRange, timezone: context.range.timezone, type: "event", now: context.now }),
          ]);
          traffic = Object.freeze({ summary, events }); providerAvailable = true;
        } catch { degraded = true; providerAvailable = false; }
      } else if (view === "acquisition") {
        if (context.range.umamiRange === null) degraded = true;
        else try { const authority = await context.runtime.analytics.getConnectionAuthority({ tenantContext: context.tenantContext, now: context.now }); traffic = await context.runtime.umami.metrics({ websiteId: authority.websiteId, range: context.range.umamiRange, timezone: context.range.timezone, type: "referrer", now: context.now }); providerAvailable = true; } catch { degraded = true; providerAvailable = false; }
      } else if (view === "products") {
        try { traffic = await context.runtime.analytics.dashboard({ tenantContext: context.tenantContext, now: context.now, period: context.range.label === "today" ? "today" : context.range.label === "7d" ? "week" : context.range.label === "90d" ? "year" : "month" }); } catch { degraded = true; }
      } else if (view === "status") {
        try { const connection = await context.runtime.analytics.getConnectionAuthority({ tenantContext: context.tenantContext, now: context.now }); providerAvailable = connection.status === "active"; } catch { providerAvailable = false; degraded = true; }
      }
      return json(Object.freeze({ schemaVersion: 1, view, range: Object.freeze({ start: commerce.rangeStart, end: commerce.rangeEnd, timezone: context.range.timezone, label: context.range.label }), status: degraded ? "degraded" : "complete", message: degraded ? "Trafik verileri geçici olarak alınamıyor. Sipariş ve sepet verileri günceldir." : null, traffic, commerce, comparisonCommerce, providerAvailable }));
    } catch (caught) { return repositoryError(caught); }
  };
  return Object.freeze(Object.fromEntries(VIEWS.map((view) => [view, make(view)])) as Record<View, (request: Request) => Promise<Response>>);
}
