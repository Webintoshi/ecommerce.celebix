import assert from "node:assert/strict";
import test from "node:test";

import { getSelfServeStatusLabel } from "./self-serve-onboarding";

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
