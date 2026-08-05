import { PANEL_ORIGIN } from "./config.ts";

export function rejectInvalidPanelMutation(request: Request) {
  if (request.method !== "POST") {
    return Response.json(
      { code: "method_not_allowed" },
      { status: 405, headers: { "cache-control": "no-store", allow: "POST" } },
    );
  }
  if (request.headers.get("origin") !== PANEL_ORIGIN) {
    return Response.json(
      { code: "panel_origin_required" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  return null;
}
