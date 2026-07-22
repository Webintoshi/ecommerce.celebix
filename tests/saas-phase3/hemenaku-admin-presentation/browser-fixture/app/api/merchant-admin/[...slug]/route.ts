const NOW = "2026-07-22T19:00:00.000Z";
const RECORD = "71000000-0000-4000-8000-000000000001";
const JOB = "73000000-0000-4000-8000-000000000001";
let status: "awaiting_provider_activation" | "cancelled" | null = null;
let version = 1;

function record() {
  return { id: RECORD, kind: "marketplace_connection", name: "Trendyol Pilot Mağaza", config: { provider: "trendyol", merchantReference: "pilot-42", syncEnabled: true }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW };
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
  return Response.json({ code: "invalid_input" }, { status: 400 });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string[] }> }) {
  const slug = await segments(context), body = await request.json();
  if (slug.join("/") === "provider-jobs/marketplace_connection" && body.recordId === RECORD && body.expectedRecordVersion === 1 && status === null) {
    status = "awaiting_provider_activation"; version = 1; return Response.json(mutation());
  }
  if (slug.join("/") === `provider-jobs/marketplace_connection/${JOB}/cancel` && body.expectedVersion === 1 && status === "awaiting_provider_activation") {
    status = "cancelled"; version = 2; return Response.json(mutation());
  }
  return Response.json({ code: "invalid_transition" }, { status: 409 });
}
