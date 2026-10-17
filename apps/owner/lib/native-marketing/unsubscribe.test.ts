import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createNativeMarketingUnsubscribeHandler } from "./unsubscribe.ts";
const TOKEN = "u".repeat(43), ORIGIN = "https://owner.saas-staging.celebix.net", NOW = new Date("2026-10-18T10:00:00.000Z");
test("unsubscribe GET is a confirmation only, uses canonical owner action, and does not touch storage", async () => {
  let writes = 0;
  const handler = createNativeMarketingUnsubscribeHandler({ publicOrigin: ORIGIN, now: () => NOW, repository: { async unsubscribe() { writes++; } } });
  const response = await handler(new Request(`https://attacker.test/api/marketing/unsubscribe?token=${TOKEN}`));
  const html = await response.text();
  assert.equal(response.status, 200); assert.equal(writes, 0); assert.ok(html.includes(`${ORIGIN}/api/marketing/unsubscribe?token=${TOKEN}`));
  assert.doesNotMatch(html, /attacker.test|customer@example/u); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});
test("RFC8058 POST hashes a bearer capability and needs neither cookies nor caller-selected store", async () => {
  const calls: unknown[] = [];
  const handler = createNativeMarketingUnsubscribeHandler({ publicOrigin: ORIGIN, now: () => NOW, repository: { async unsubscribe(input) { calls.push(input); } } });
  const response = await handler(new Request(`${ORIGIN}/api/marketing/unsubscribe?token=${TOKEN}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }));
  assert.equal(response.status, 200); assert.deepEqual(calls, [{ tokenDigest: createHash("sha256").update(TOKEN).digest("hex"), now: NOW }]);
  assert.equal((await response.text()).length, 0); assert.doesNotMatch(JSON.stringify(calls), new RegExp(TOKEN));
});
test("unsubscribe rejects malformed tokens, ambiguous parameters, foreign-origin human forms and unwanted bodies", async () => {
  let writes = 0;
  const handler = createNativeMarketingUnsubscribeHandler({ publicOrigin: ORIGIN, now: () => NOW, repository: { async unsubscribe() { writes++; } } });
  for (const request of [
    new Request(`${ORIGIN}/api/marketing/unsubscribe?token=${TOKEN}&store=other`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "confirm=unsubscribe" }),
    new Request(`${ORIGIN}/api/marketing/unsubscribe?token=short`),
    new Request(`${ORIGIN}/api/marketing/unsubscribe?token=${TOKEN}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://attacker.test" }, body: "confirm=unsubscribe" }),
    new Request(`${ORIGIN}/api/marketing/unsubscribe?token=${TOKEN}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "confirm=unsubscribe&anything=else" }),
  ]) assert.equal((await handler(request)).status, 400);
  assert.equal(writes, 0);
});
test("human POST completes while persistence failure returns retryable503 without leaking details", async () => {
  const request = () => new Request(`${ORIGIN}/api/marketing/unsubscribe?token=${TOKEN}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN }, body: "confirm=unsubscribe" });
  const ok = createNativeMarketingUnsubscribeHandler({ publicOrigin: ORIGIN, now: () => NOW, repository: { async unsubscribe() {} } });
  assert.match(await (await ok(request())).text(), /Pazarlama e-postaları kapatıldı/u);
  const fail = createNativeMarketingUnsubscribeHandler({ publicOrigin: ORIGIN, now: () => NOW, repository: { async unsubscribe() { throw Error("private database text"); } } });
  const response = await fail(request()); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private|database/u);
});
