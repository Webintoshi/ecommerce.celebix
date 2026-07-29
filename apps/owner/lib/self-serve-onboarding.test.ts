import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/lib/")) {
      return {
        shortCircuit: true,
        url: new URL(`${specifier.slice("@/lib/".length)}.ts`, import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { getSelfServeStatusLabel } = await import("./self-serve-onboarding.ts");

test("legacy self-serve statuses use monitoring language instead of approval queue copy", () => {
  const labels = [
    getSelfServeStatusLabel("pending_owner_approval"),
    getSelfServeStatusLabel("approved"),
    getSelfServeStatusLabel("rejected"),
  ].join(" ");

  assert.doesNotMatch(labels, /onay/i);
  assert.doesNotMatch(labels, /red/i);
  assert.doesNotMatch(labels, /approval/i);
});
