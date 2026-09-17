import assert from "node:assert/strict";
import test from "node:test";
import { createDisabledCustomerPanelAuthRouteSet } from "../panel-auth-route-mount/route-set.ts";
test("invitation routes remain mounted disabled without provider or persistence composition", async () => {
  const routes = createDisabledCustomerPanelAuthRouteSet();
  for (const [name, path, method] of [["invitationAccept", "accept", "GET"], ["invitationAccept", "accept", "POST"], ["invitationStart", "start", "POST"], ["invitationConfirm", "confirm", "GET"]] as const) {
    const result = await routes[name](new Request(`https://panel.example.test/invitations/${path}`, { method }));
    assert.equal(result.status, 503); assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal(result.headers.has("set-cookie"), false); assert.equal(result.headers.has("location"), false);
  }
  assert.equal(routes.readiness.invitationState, "mounted_disabled");
});
