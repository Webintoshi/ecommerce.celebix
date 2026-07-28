import assert from "node:assert/strict";
import test from "node:test";

export const PRODUCT_ONBOARDING_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 1025, height: 768 }),
  Object.freeze({ width: 1024, height: 768 }),
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 320, height: 720 }),
]);

export function assertProductOnboardingBrowserEvidence(evidence) {
  assert.equal(typeof evidence, "object");
  assert.equal(evidence !== null, true);
  assert.equal(evidence.horizontalOverflow, 0);
  assert.equal(evidence.minimumTargetSize >= 48, true);
  assert.equal(evidence.primaryContrast >= 4.5, true);
  assert.equal(evidence.reducedMotionMilliseconds <= 0.02, true);
  assert.deepEqual(evidence.consoleErrors, []);
  assert.deepEqual(evidence.secretLeaks, []);
  assert.equal(evidence.dialogFocusTrapped, true);
  assert.equal(evidence.focusReturned, true);
  assert.equal(evidence.partialMediaFailureTruthful, true);
}

test("product onboarding browser acceptance contract covers every approved viewport", () => {
  assert.deepEqual(PRODUCT_ONBOARDING_VIEWPORTS, [
    { width: 1440, height: 900 },
    { width: 1025, height: 768 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]);
});

test("product onboarding browser evidence passes only with accessible fail-closed results", () => {
  assert.doesNotThrow(() =>
    assertProductOnboardingBrowserEvidence({
      horizontalOverflow: 0,
      minimumTargetSize: 48,
      primaryContrast: 4.5,
      reducedMotionMilliseconds: 0.01,
      consoleErrors: [],
      secretLeaks: [],
      dialogFocusTrapped: true,
      focusReturned: true,
      partialMediaFailureTruthful: true,
    }),
  );

  assert.throws(() =>
    assertProductOnboardingBrowserEvidence({
      horizontalOverflow: 1,
      minimumTargetSize: 44,
      primaryContrast: 3,
      reducedMotionMilliseconds: 300,
      consoleErrors: ["runtime failure"],
      secretLeaks: ["credential"],
      dialogFocusTrapped: false,
      focusReturned: false,
      partialMediaFailureTruthful: false,
    }),
  );
});
