export async function GET() {
  return Response.json(
    { code: "panel_callback_required" },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
