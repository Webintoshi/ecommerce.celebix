export interface PanelApiSessionResolver {
  (request: Request): Promise<unknown | null>;
}

function json(body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function createDenyByDefaultPanelApiHandler(input: {
  resolveSession: PanelApiSessionResolver;
}) {
  return async function denyByDefault(request: Request) {
    const session = await input.resolveSession(request).catch(() => null);
    if (!session) return json({ code: "unauthenticated" }, 401);
    return json({ code: "panel_api_denied" }, 403);
  };
}
