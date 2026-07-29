import assert from "node:assert/strict";
import test from "node:test";

type DefaultModule = typeof import("./default.ts");

const defaults = await import("./default.ts").catch(() => ({} as Partial<DefaultModule>));

test("exports frozen default handlers backed by the singleton server access resolver", () => {
  assert.equal(typeof defaults.handleDefaultPanelActiveStore, "function");
  assert.equal(typeof defaults.handleDefaultPanelSessionLogout, "function");
  assert.equal(Object.isFrozen(defaults.handleDefaultPanelActiveStore), true);
  assert.equal(Object.isFrozen(defaults.handleDefaultPanelSessionLogout), true);
});
