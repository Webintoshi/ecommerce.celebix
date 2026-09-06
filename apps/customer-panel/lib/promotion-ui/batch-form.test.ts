import assert from "node:assert/strict";
import test from "node:test";

import { parsePromotionBatchCreateRequest } from "@celebix/saas-contracts";

async function subject() {
  return import("./batch-form.ts").catch(() => ({} as Record<string, unknown>));
}

test("default code batch form produces a contract-valid request", async () => {
  const module = await subject();
  assert.equal(typeof module.preparePromotionBatchCreate, "function");
  assert.deepEqual(module.defaultPromotionBatchForm, {
    count: "100",
    prefix: "VIP_",
    codeLength: "24",
    perCustomerUsage: "1",
  });

  const prepared = (module.preparePromotionBatchCreate as Function)({
    ...module.defaultPromotionBatchForm as object,
    expiresAt: null,
  });

  assert.deepEqual(prepared, {
    kind: "valid",
    value: {
      count: 100,
      prefix: "VIP_",
      codeLength: 24,
      perCustomerUsage: 1,
      expiresAt: null,
    },
  });
  assert.doesNotThrow(() => parsePromotionBatchCreateRequest(prepared.value));
});

test("code batch form explains when the random suffix is shorter than sixteen characters", async () => {
  const module = await subject();
  assert.equal(typeof module.preparePromotionBatchCreate, "function");

  assert.deepEqual((module.preparePromotionBatchCreate as Function)({
    count: "3",
    prefix: "ATQA_",
    codeLength: "20",
    perCustomerUsage: "1",
    expiresAt: null,
  }), {
    kind: "invalid",
    message: "Toplam kod uzunluğu, önekten sonra en az 16 rastgele karakter bırakmalı.",
  });
});
