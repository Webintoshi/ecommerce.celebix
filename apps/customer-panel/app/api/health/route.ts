export async function GET() {
  return Response.json(
    { status: "ok", service: "customer-panel" },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
