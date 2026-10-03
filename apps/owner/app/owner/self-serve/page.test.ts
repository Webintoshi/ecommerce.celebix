import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("retired self-serve routes use durable platform operations and never run old monitor reads", () => {
  for (const path of ["./page.tsx", "./[id]/page.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /redirect\("\/operations"\)/);
    assert.doesNotMatch(source, /getSelfServeOnboardingRequest|SelfServeOwnerRequestsPanel|SelfServeOwnerRequestDetail/);
  }
});
