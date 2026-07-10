export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!url.searchParams.get("state") || !url.searchParams.get("code")) {
    return Response.json(
      { code: "invalid_callback_state" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    { code: "panel_auth_disabled" },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
