import assert from "node:assert/strict";
import test from "node:test";
import { createStoreAdminInvitationHandlers } from "./auth-handler.ts";
import { createTrustedPanelSessionPresenter } from "../panel-session-completion/completion.ts";
const origin = "https://panel.example.test", now = new Date("2026-09-17T12:00:00.000Z"), expires = "2026-09-17T12:04:00.000Z";
const token = Buffer.alloc(32, 1).toString("base64url"), grant = `ig1.${token}`, proof = `pb1.${token}`;
const baseCookies = `__Host-celebix_panel_pre_auth=${proof}; __Host-celebix_invitation_grant=${grant}`;
const op = "11111111-1111-4111-8111-111111111111";
function cookies(response: Response) { return response.headers.getSetCookie().map(c => c.split(";")[0]).join("; "); }
function nonce(html: string) { return /name="csrfToken" value="([^"]+)"/.exec(html)![1]; }
function fixture() {
  const accepts: string[] = [], starts: string[] = []; let commit = false, count = 0;
  const handlers = createStoreAdminInvitationHandlers({ panelOrigin: origin, acceptanceOrigin: origin, environment: "disposable_test", clock: () => now,
    randomBytes: n => Buffer.alloc(n, ++count), randomUuid: () => op,
    transport: {
      async startInvitation(input) { starts.push(input.token); return { schemaVersion: 3, kind: "invitation_login_ready", providerAuthorizationUrl: `https://identity.example.test/authorize?state=pinvite_0123456789abcdef&redirect_uri=${encodeURIComponent(origin + "/auth/callback")}&response_type=code&response_mode=query`, browserBindingExpiresAt: expires }; },
      async previewInvitation() { return { schemaVersion: 3, kind: "invitation_confirmation", storeName: "Test <Store>", email: "recipient@example.test", role: "admin", expiresAt: expires }; },
      async acceptInvitation(input) { accepts.push(input.operationId); if (!commit) { commit = true; throw new Error("lost response after commit"); } return { schemaVersion: 3, kind: "invitation_accepted_access_retry", accepted: true, retryable: true }; },
    }, presentSession: async () => { throw new Error("must not present before session ready"); },
  });
  return { handlers, accepts, starts };
}
test("GETs never start or accept; confirmation escapes projection and secrets never enter HTML", async () => {
  const f = fixture(), landing = await f.handlers.accept(new Request(`${origin}/invitations/accept`));
  assert.equal(landing.status, 200); assert.equal(landing.headers.get("cache-control"), "no-store");
  assert.equal(landing.headers.get("referrer-policy"), "no-referrer");
  const confirm = await f.handlers.confirm(new Request(`${origin}/invitations/confirm`, { headers: { cookie: baseCookies } }));
  assert.equal(confirm.headers.get("referrer-policy"), "same-origin");
  const html = await confirm.text();
  assert.match(html, /Test &lt;Store&gt;/); assert.match(html, /Kabul et/);
  assert.ok(!html.includes(grant) && !html.includes(proof)); assert.deepEqual(f.accepts, []); assert.deepEqual(f.starts, []);
});
test("lost acceptance response, refresh and retry keep the same operation and show accepted-access retry truthfully", async () => {
  const f = fixture();
  const first = await f.handlers.confirm(new Request(`${origin}/invitations/confirm`, { headers: { cookie: baseCookies } }));
  let jar = baseCookies + "; " + cookies(first), html = await first.text();
  const post = () => f.handlers.accept(new Request(`${origin}/invitations/accept`, { method: "POST", headers: { origin, cookie: jar, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: nonce(html), operationId: op }) }));
  const lost = await post(); assert.equal(lost.status, 503); assert.equal(lost.headers.getSetCookie().length, 0);
  const refreshed = await f.handlers.confirm(new Request(`${origin}/invitations/confirm`, { headers: { cookie: jar } }));
  const fresh = cookies(refreshed); jar = jar.split("; ").filter(c => !fresh.split("; ").some(n => n.split("=")[0] === c.split("=")[0])).concat(fresh.split("; ")).join("; "); html = await refreshed.text();
  const retry = await post(); assert.equal(retry.status, 503); assert.match(await retry.text(), /Davet kabul edildi/);
  assert.deepEqual(f.accepts, [op, op]);
});
test("origin, csrf, duplicate cookies, extra authority and oversized POSTs stop before acceptance", async () => {
  const f = fixture(), get = await f.handlers.confirm(new Request(`${origin}/invitations/confirm`, { headers: { cookie: baseCookies } }));
  const jar = `${baseCookies}; ${cookies(get)}`, csrfToken = nonce(await get.text());
  for (const mutation of [{ origin: "https://evil.example" }, { cookie: jar + `; __Host-celebix_invitation_grant=${grant}` }, { body: new URLSearchParams({ csrfToken: "bad", operationId: op }).toString() }, { body: new URLSearchParams({ csrfToken, operationId: op, role: "owner" }).toString() }, { body: "x".repeat(4097) }, { headers: { "x-celebix-subject": "injected" } }]) {
    const r = await f.handlers.accept(new Request(`${origin}/invitations/accept`, { method: "POST", headers: { origin: mutation.origin ?? origin, cookie: mutation.cookie ?? jar, "content-type": "application/x-www-form-urlencoded", ...mutation.headers }, body: mutation.body ?? new URLSearchParams({ csrfToken, operationId: op }).toString() }));
    assert.equal(r.status, 400);
  }
  assert.deepEqual(f.accepts, []);
});
test("encoded duplicate grant cookie aliases cannot hide ambiguous authority", async () => {
  const f = fixture();
  const response = await f.handlers.confirm(new Request(`${origin}/invitations/confirm`, { headers: { cookie: `${baseCookies}; %5F%5FHost-celebix_invitation_grant=${grant}` } }));
  assert.equal(response.status, 400);
});
test("trusted session presenter sends only handoff to the exact centrally selected host", async () => {
  const sessionCredential = `v1.test.${token}`, handoff = `v1.handoff.${token}`, destinationOrigin = "https://admin.example.test";
  const presenter = createTrustedPanelSessionPresenter({ clock: () => now, crossHostTransfer: {
    async issueHandoff(input) { assert.equal(input.currentCredential, sessionCredential); assert.equal(input.destinationHostname, "admin.example.test"); return Object.freeze({ kind: "handoff_issued", credential: handoff, destinationOrigin, expiresAt: "2026-09-17T12:01:00.000Z" }); },
    async recoverIssuedHandoff() { throw new Error("unexpected"); }, randomUuid: () => op, randomBytes: n => Buffer.alloc(n, 2),
  } });
  const response = await presenter(Object.freeze({ schemaVersion: 1, kind: "session_ready", sessionCredential, sessionIssuedAt: now.toISOString(), sessionExpiresAt: "2026-09-17T13:00:00.000Z", destinationStoreId: op, destinationOrigin, redirectPath: "/" }));
  const html = await response.text(); assert.match(html, /https:\/\/admin.example.test\/auth\/handoff/); assert.ok(!html.includes(sessionCredential)); assert.ok(!response.headers.getSetCookie().some(c => c.includes("celebix_panel_session")));
});
