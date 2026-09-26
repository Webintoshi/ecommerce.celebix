import { fixtureNavigationAsset } from "../../design-settings-fix/catalog-fixture";

export async function GET(request: Request) {
  try { if (new URL(request.headers.get("referer") ?? "").pathname === "/design-settings-fix") return Response.json({ assets: [fixtureNavigationAsset] }); } catch { /* Preserve other isolated fixture responses. */ }
  return Response.json({ assets: [] });
}
