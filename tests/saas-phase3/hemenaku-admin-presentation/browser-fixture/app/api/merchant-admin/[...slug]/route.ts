import { merchantAdminConfig } from "@celebix/saas-data";

const NOW = "2026-07-22T19:00:00.000Z";
const RECORD = "71000000-0000-4000-8000-000000000001";
const JOB = "73000000-0000-4000-8000-000000000001";
const SEO_RECORD = "74000000-0000-4000-8000-000000000001";
const PRODUCT_RESOURCE = "71000000-0000-4000-8000-000000000099";
const GENERAL_RECORD = "75000000-0000-4000-8000-000000000001";
const operations = new Set<string>();
let status: "awaiting_provider_activation" | "cancelled" | null = null;
let version = 1;

function record() {
  return { id: RECORD, kind: "marketplace_connection", name: "Trendyol Pilot Mağaza", config: { provider: "trendyol", merchantReference: "pilot-42", syncEnabled: true }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW };
}
function seoRecord() {
  return { id: SEO_RECORD, kind: "seo_product_entry", name: "Keten Gömlek SEO", config: { resourceId: PRODUCT_RESOURCE, metaTitle: "Keten Gömlek", metaDescription: "Doğal keten gömlek.", canonicalPath: "/urunler/keten-gomlek" }, status: "active", version: 2, createdAt: NOW, updatedAt: NOW };
}
function generalRecord() {
  return { id: GENERAL_RECORD, kind: "general_setting", name: "Ana mağaza profili", config: { storeDisplayName: "Hemen Al", supportEmail: "destek@example.test", timezone: "Europe/Istanbul" }, status: "active", version: 2, createdAt: NOW, updatedAt: NOW };
}
function job() {
  return { id: JOB, recordId: RECORD, recordKind: "marketplace_connection", action: "synchronization", status, version, requestedAt: NOW, updatedAt: NOW };
}
function mutation() {
  const { requestedAt: _requestedAt, ...result } = job();
  return { ...result, replayed: false };
}
async function segments(context: { params: Promise<{ slug: string[] }> }) { return (await context.params).slug; }

export async function GET(_request: Request, context: { params: Promise<{ slug: string[] }> }) {
  const slug = await segments(context);
  if (slug.join("/") === "records/marketplace_connection") return Response.json({ items: [record()] });
  if (slug.join("/") === "events/marketplace_connection") return Response.json({ items: [] });
  if (slug.join("/") === "provider-jobs/marketplace_connection") return Response.json({ items: status === null ? [] : [job()] });
  if (slug.join("/") === "records/seo_product_entry") return Response.json({ items: [seoRecord()] });
  if (slug.join("/") === "events/seo_product_entry") return Response.json({ items: [] });
  if (slug.join("/") === "records/general_setting") return Response.json({ items: [generalRecord()] });
  if (slug.join("/") === "events/general_setting") return Response.json({ items: [] });
  return Response.json({ code: "invalid_input" }, { status: 400 });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string[] }> }) {
  const slug = await segments(context), body = await request.json().catch(() => null);
  if (slug.join("/") === "records/seo_product_entry") {
    const operationId = request.headers.get("idempotency-key");
    if (
      !body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).sort().join(",") !== "config,expectedVersion,name,recordId,status" ||
      body.recordId !== SEO_RECORD || body.expectedVersion !== 2 ||
      typeof body.name !== "string" || body.name !== body.name.trim() ||
      body.name.length < 1 || body.name.length > 160 || body.status !== "active" ||
      !operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId)
    ) return Response.json({ code: "invalid_input" }, { status: 400 });
    try { merchantAdminConfig("seo_product_entry", body.config); }
    catch { return Response.json({ code: "invalid_input" }, { status: 400 }); }
    const replayed = operations.has(operationId);
    operations.add(operationId);
    return Response.json({ id: SEO_RECORD, kind: "seo_product_entry", status: "active", version: 2, updatedAt: NOW, replayed });
  }
  if (slug.join("/") === "provider-jobs/marketplace_connection" && body.recordId === RECORD && body.expectedRecordVersion === 1 && status === null) {
    status = "awaiting_provider_activation"; version = 1; return Response.json(mutation());
  }
  if (slug.join("/") === `provider-jobs/marketplace_connection/${JOB}/cancel` && body.expectedVersion === 1 && status === "awaiting_provider_activation") {
    status = "cancelled"; version = 2; return Response.json(mutation());
  }
  return Response.json({ code: "invalid_transition" }, { status: 409 });
}
