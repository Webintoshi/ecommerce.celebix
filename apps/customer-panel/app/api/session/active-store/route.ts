import { rejectInvalidPanelMutation } from "../../../../lib/request-security.ts";

export async function POST(request: Request) {
  const rejected = rejectInvalidPanelMutation(request);
  if (rejected) return rejected;
  return Response.json(
    { code: "unauthenticated" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}
