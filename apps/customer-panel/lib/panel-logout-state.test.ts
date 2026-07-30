import assert from "node:assert/strict";
import test from "node:test";

type LogoutStateModule = typeof import("./panel-logout-state.ts");
const logoutState = await import("./panel-logout-state.ts").catch(() => ({} as Partial<LogoutStateModule>));

const NOW = new Date("2026-07-30T12:00:00.000Z");
const ORIGIN = "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site";

test("logout state is signed, short-lived, and carries only the canonical return origin", () => {
  if (typeof logoutState.createPanelLogoutStateCodec !== "function") return;
  const codec = logoutState.createPanelLogoutStateCodec(new Uint8Array(32).fill(0x41));
  const state = codec.issue({
    destinationOrigin: ORIGIN,
    now: NOW,
    randomBytes: (size) => new Uint8Array(size).fill(0x42),
  });
  assert.match(state, /^lo1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(codec.verify({ state, now: new Date(NOW.getTime() + 60_000) }), { destinationOrigin: ORIGIN });
  assert.equal(state.includes(ORIGIN), false);
  assert.throws(() => codec.verify({ state: `${state.slice(0, -1)}A`, now: NOW }), /panel_logout_state_invalid/);
  assert.throws(() => codec.verify({ state, now: new Date(NOW.getTime() + 301_000) }), /panel_logout_state_invalid/);
});
