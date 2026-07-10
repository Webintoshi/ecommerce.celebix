import { buildPanelSessionClearCookie } from "../../../lib/session.ts";
import { rejectInvalidPanelMutation } from "../../../lib/request-security.ts";

export async function POST(request: Request) {
  const rejected = rejectInvalidPanelMutation(request);
  if (rejected) return rejected;
  return new Response(null, {
    status: 303,
    headers: {
      location: "https://panel.celebix.site/login",
      "cache-control": "no-store",
      "set-cookie": buildPanelSessionClearCookie({ kind: "production" }),
    },
  });
}
