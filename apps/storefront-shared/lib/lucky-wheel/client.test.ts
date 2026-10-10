import assert from "node:assert/strict";
import test from "node:test";
import { createLuckyWheelClient, createWheelParticipation, LuckyWheelClientError, wheelLandingAngle } from "./client.ts";
import { wheelAward, wheelCampaign, wheelCommand } from "./test-utils.ts";

test("contact-first parser rejects blank or both contacts without issuing a spin", async () => {
  let spins = 0;
  const state = createWheelParticipation({ spin: async () => { spins++; return wheelAward; }, result: async () => null }, { read: () => null, write() {} }, () => wheelCommand.operationId);
  await assert.rejects(state.spin(wheelCampaign(), { email: "", marketingConsent: false }));
  await assert.rejects(state.spin(wheelCampaign(), { email: "ada@example.test", phone: "+905551234567", marketingConsent: false }));
  assert.equal(spins, 0);
});
test("double click shares one persisted command and an uncertain reply keeps operation for reopen", async () => {
  const recorded: unknown[] = []; let saved: string | null = null, release!: (value: typeof wheelAward) => void;
  const promise = new Promise<typeof wheelAward>(resolve => { release = resolve; });
  const state = createWheelParticipation({ spin: async input => { recorded.push(input); return promise; }, result: async (_campaign, operation) => operation ? wheelAward : null }, { read: () => saved, write: value => { saved = value; } }, () => wheelCommand.operationId);
  const one = state.spin(wheelCampaign(), { email: "ada@example.test", marketingConsent: false }), two = state.spin(wheelCampaign(), { email: "ada@example.test", marketingConsent: false });
  assert.equal(recorded.length, 1); assert.equal(saved, wheelCommand.operationId); release(wheelAward);
  assert.deepEqual(await one, wheelAward); assert.deepEqual(await two, wheelAward);
  const reopened = createWheelParticipation({ spin: async () => { throw Error("must not award again"); }, result: async () => wheelAward }, { read: () => saved, write: value => { saved = value; } });
  assert.deepEqual(await reopened.recover(wheelCampaign()), wheelAward); assert.equal(saved, wheelCommand.operationId);
});
test("network timeout recovery never creates a fresh operation or uses contact as a lookup", async () => {
  let saved: string | null = null; const calls: unknown[] = [];
  const state = createWheelParticipation({ spin: async input => { calls.push(input); throw Error("timeout"); }, result: async (...input) => { calls.push(input); return null; } }, { read: () => saved, write: value => { saved = value; } }, () => wheelCommand.operationId);
  await assert.rejects(state.spin(wheelCampaign(), { email: "ada@example.test", marketingConsent: false }));
  assert.equal(saved, wheelCommand.operationId); assert.equal(await state.recover(wheelCampaign()), null);
  await assert.rejects(state.spin(wheelCampaign(), { email: "different@example.test", marketingConsent: true }));
  assert.equal((calls[0] as Record<string, unknown>).operationId, (calls[2] as Record<string, unknown>).operationId);
  assert.equal((calls[2] as Record<string, unknown>).email, "ada@example.test");
});
test("client sends idempotency key and exact server version with no customer authority or message request", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = createLuckyWheelClient(async (path, init) => { calls.push({ path: String(path), init }); return Response.json(wheelAward); });
  assert.deepEqual(await client.spin(wheelCommand), wheelAward);
  assert.equal(calls[0].path, "/api/lucky-wheel/spin");
  assert.equal((calls[0].init!.headers as Record<string, string>)["idempotency-key"], wheelCommand.operationId);
  assert.deepEqual(JSON.parse(String(calls[0].init!.body)), wheelCommand);
  await client.result(wheelCommand.campaignId, wheelCommand.operationId);
  assert.ok(calls[1].path.includes("operationId=")); assert.equal(calls[1].path.includes("email="), false);
});
test("fixed pointer lands on the stored prize for 4, 6 and 8 slices", () => {
  for (const count of [4, 6, 8]) { const campaign = wheelCampaign(count); for (let index = 0; index < count; index++) { const angle = wheelLandingAngle(campaign.prizes, campaign.prizes[index]!.id); assert.equal((angle + (index + .5) * 360 / count) % 360, 0); } }
  assert.throws(() => wheelLandingAngle(wheelCampaign().prizes, "forged"));
});
test("a definitive precommit rejection lets a corrected command use refreshed version and a new operation", async () => {
  let saved: string | null = null, attempt = 0; const calls: Array<Record<string, unknown>> = [], nextOperation = "22000000-0000-4000-8000-000000000002";
  const state = createWheelParticipation({ spin: async input => { calls.push(input); if (attempt++ === 0) throw new LuckyWheelClientError("version_conflict"); return { ...wheelAward, operationId: input.operationId, campaignVersion: input.expectedVersion }; }, result: async () => null }, { read: () => saved, write: value => { saved = value; } }, () => attempt ? nextOperation : wheelCommand.operationId);
  await assert.rejects(state.spin(wheelCampaign(), { email: "ada@example.test", marketingConsent: false }));
  assert.equal(saved, null);
  await state.spin({ ...wheelCampaign(), version: 2 }, { email: "corrected@example.test", marketingConsent: true });
  assert.equal(calls[1].expectedVersion, 2); assert.equal(calls[1].email, "corrected@example.test"); assert.equal(calls[1].operationId, nextOperation);
});
test("stored award preserves its operation until participation window ends then permits one fresh spin", async () => {
  let saved: string | null = wheelAward.operationId, spins = 0;
  const state = createWheelParticipation({ result: async () => wheelAward, spin: async input => { spins++; return { ...wheelAward, operationId: input.operationId }; } }, { read: () => saved, write: value => { saved = value; } }, () => "22000000-0000-4000-8000-000000000002", () => Date.parse(wheelAward.repeatEligibleAt) + 1);
  await state.recover(wheelCampaign()); await state.spin(wheelCampaign(), { email: "ada@example.test", marketingConsent: false });
  assert.equal(spins, 1); assert.notEqual(saved, wheelAward.operationId);
});
