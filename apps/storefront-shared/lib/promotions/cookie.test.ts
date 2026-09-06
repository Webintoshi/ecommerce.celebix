import assert from "node:assert/strict";
import test from "node:test";

const modulePromise = import("./cookie.ts").catch(() => null);

test("coupon cookie is an HttpOnly bounded same-host candidate array without tenant or promotion authority", async () => {
  const module = await modulePromise;
  assert.ok(module, "coupon cookie module must exist");
  const value = module.serializeCouponCandidateCookie(["UYELIK", "YUZDE10"]);
  assert.equal(
    value,
    "__Host-celebix_coupon=UYELIK.YUZDE10; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax",
  );
  assert.doesNotMatch(value, /store|tenant|promotionId|campaignId/iu);
  assert.deepEqual(module.readCouponCandidateCookie("a=1; __Host-celebix_coupon=UYELIK.YUZDE10; b=2"), ["UYELIK", "YUZDE10"]);
});

test("malformed coupon cookies are ignored and removal expires only the candidate", async () => {
  const module = await modulePromise;
  assert.ok(module, "coupon cookie module must exist");
  for (const cookie of [null, "", "__Host-celebix_coupon=vip", "__Host-celebix_coupon=VIP%0AOTHER", "__Host-celebix_coupon=VIP; __Host-celebix_coupon=OTHER"])
    assert.deepEqual(module.readCouponCandidateCookie(cookie), []);
  assert.equal(
    module.clearCouponCandidateCookie(),
    "__Host-celebix_coupon=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
  );
});

test("stacked candidate persistence preserves remaining validated codes after one removal and rejects overflow", async () => {
  const module = await modulePromise;
  assert.ok(module, "coupon cookie module must exist");
  assert.equal(module.serializeCouponCandidateCookie(["VIP", "YUZDE10"].filter((code) => code !== "VIP")), "__Host-celebix_coupon=YUZDE10; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax");
  assert.throws(() => module.serializeCouponCandidateCookie(["A", "B", "C", "D", "E", "F"]), /coupon_candidate_cookie_invalid/u);
  assert.throws(() => module.serializeCouponCandidateCookie(["VIP", "VIP"]), /coupon_candidate_cookie_invalid/u);
});
