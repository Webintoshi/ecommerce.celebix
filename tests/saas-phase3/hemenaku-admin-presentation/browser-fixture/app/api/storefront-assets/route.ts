import { fixtureNavigationAsset } from "../../design-settings-fix/catalog-fixture";

export async function GET(request: Request) {
  try { if (new URL(request.headers.get("referer") ?? "").pathname === "/design-settings-fix") return Response.json({ assets: [fixtureNavigationAsset] }); } catch { /* Preserve other isolated fixture responses. */ }
  return Response.json({ assets: [] });
}

// The collection upload fixture deliberately fails without creating any public asset.
export async function POST(request: Request) {
  const body = await request.formData();
  if (body.get("kind") === "collection") return Response.json({ code: "unavailable" }, { status: 503 });
  return Response.json({ code: "method_not_allowed" }, { status: 405 });
}
