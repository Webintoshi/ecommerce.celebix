// Isolated browser evidence. All HTTPS requests are intercepted; no real provider/account/database.
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createOwnerPanelBrowserBindingInternalGateway, createPanelBrowserBindingInternalGatewayApproval } from "../../../apps/owner/lib/panel-browser-binding/internal-gateway.ts";
import { createAuthenticatedPanelBrowserBindingTransport } from "../../../apps/customer-panel/lib/panel-browser-binding-bootstrap/transport.ts";
import { createPanelBrowserBindingBootstrapApproval } from "../../../apps/customer-panel/lib/panel-browser-binding-bootstrap/activation.ts";
import { createAuthenticatedPanelSessionCompletionTransport, panelSessionHandoffResponseSignaturePreimage } from "../../../apps/customer-panel/lib/panel-session-completion/transport.ts";
import { createPanelSessionCompletionApproval } from "../../../apps/customer-panel/lib/panel-session-completion/activation.ts";
import { createPanelSessionCompletionHandler, createTrustedPanelSessionPresenter } from "../../../apps/customer-panel/lib/panel-session-completion/completion.ts";
import { createStoreAdminInvitationHandlers } from "../../../apps/customer-panel/lib/store-admin-invitations/auth-handler.ts";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.INVITATION_PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({ executablePath: process.env.INVITATION_CHROME_EXECUTABLE, headless: true });
const panel = "https://panel.invitation.example.test", owner = "https://owner.invitation.example.test", idp = "https://idp.invitation.example.test", admin = "https://admin.invitation.example.test";
const now = new Date(), clock = () => new Date(now), expiry = new Date(+now + 240000).toISOString();
const key = Buffer.alloc(32, 4), token = Buffer.alloc(32, 7).toString("base64url"), grant = `ig1.${Buffer.alloc(32, 8).toString("base64url")}`;
const session = `v1.fixture.${Buffer.alloc(32, 9).toString("base64url")}`, storeId = "11111111-1111-4111-8111-111111111111";
const providerUrl = `${idp}/authorize?state=pinvite_fixture_0123456789&redirect_uri=${encodeURIComponent(panel + "/auth/callback")}&response_type=code&response_mode=query`;
const evidence = [];
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
    const context = await browser.newContext({ viewport });
    context.setDefaultTimeout(5000);
    let started = 0, membershipWrites = 0, acceptedOperation = null, browserProof = null, loseResponse = true;
    const acceptOperations = [], errors = [], requested = [];
    const gateway = createOwnerPanelBrowserBindingInternalGateway({ activationApproval: createPanelBrowserBindingInternalGatewayApproval("disposable_test"), ownerInternalOrigin: owner, panelCallbackAuthority: `${panel}/auth/callback`, keys: new Map([["fixture", key]]), clock, maximumBodyBytes: 16384, repository: { async bindBrowserCredential() { throw new Error("registration forbidden"); } }, audit() {}, invitations: {
      async start(t, p) { assert.equal(t, token); browserProof = p; started++; return { kind: "invitation_login_ready", providerAuthorizationUrl: providerUrl, browserBindingExpiresAt: expiry }; },
      async preview(g, p) { assert.equal(g, grant); assert.equal(p, browserProof); return { kind: "invitation_confirmation", storeName: "Fixture <Mağaza>", email: "recipient@example.test", role: "admin", expiresAt: expiry }; },
      async accept(g, p, operationId) { assert.equal(g, grant); assert.equal(p, browserProof); acceptOperations.push(operationId); if (acceptedOperation === null) { membershipWrites++; acceptedOperation = operationId; } else assert.equal(operationId, acceptedOperation); return { kind: "invitation_session_ready", credential: session, activeStoreId: storeId, destinationOrigin: admin, issuedAt: now.toISOString(), expiresAt: new Date(+now + 3600000).toISOString() }; },
    } });
    const transport = createAuthenticatedPanelBrowserBindingTransport({ activationApproval: createPanelBrowserBindingBootstrapApproval("disposable_test"), ownerInternalOrigin: owner, panelCallbackAuthority: `${panel}/auth/callback`, activeKeyId: "fixture", activeSecret: key, clock, deadlineMs: 1000, maximumResponseBytes: 16384, audit() {}, async fetch(request) {
      const op = (await request.clone().json()).operation;
      const response = await gateway(request);
      if (op === "invitation_accept" && loseResponse) { loseResponse = false; throw new Error("fixture lost signed acceptance response after commit"); }
      Object.defineProperty(response, "url", { value: request.url }); return response;
    } });
    const crossHostTransfer = { async issueHandoff(input) { assert.equal(input.currentCredential, session); assert.equal(input.destinationHostname, new URL(admin).hostname); return Object.freeze({ kind: "handoff_issued", credential: `v1.handoff.${Buffer.alloc(32, 10).toString("base64url")}`, destinationOrigin: admin, expiresAt: new Date(+now + 60000).toISOString() }); }, async recoverIssuedHandoff() { throw new Error("unexpected"); }, randomUuid: randomUUID, randomBytes };
    const handlers = createStoreAdminInvitationHandlers({ panelOrigin: panel, acceptanceOrigin: panel, environment: "disposable_test", clock, transport, presentSession: createTrustedPanelSessionPresenter({ clock, crossHostTransfer }) });
    const callbackTransport = createAuthenticatedPanelSessionCompletionTransport({ activationApproval: createPanelSessionCompletionApproval("disposable_test"), ownerInternalOrigin: owner, panelCallbackAuthority: `${panel}/auth/callback`, activeKeyId: "fixture", activeSecret: key, clock, deadlineMs: 1000, maximumResponseBytes: 4096, audit() {}, async fetch(request) {
      const raw = await request.text(), input = JSON.parse(raw); assert.equal(input.schemaVersion, 2); assert.equal(input.browserBindingCredential, browserProof);
      const body = JSON.stringify({ schemaVersion: 2, kind: "invitation_confirmation_ready", grantCredential: grant, grantExpiresAt: expiry, continuationPath: "/invitations/confirm" });
      const timestamp = request.headers.get("x-celebix-callback-timestamp"), preimage = panelSessionHandoffResponseSignaturePreimage({ requestTimestamp: timestamp, requestBodyDigest: createHash("sha256").update(raw).digest("hex"), status: 200, responseBodyDigest: createHash("sha256").update(body).digest("hex") });
      const response = new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-celebix-session-response-key-id": "fixture", "x-celebix-session-response-timestamp": timestamp, "x-celebix-session-response-signature": createHmac("sha256", key).update(preimage).digest("base64url") } });
      Object.defineProperty(response, "url", { value: request.url }); return response;
    } });
    const callback = createPanelSessionCompletionHandler({ activationApproval: createPanelSessionCompletionApproval("disposable_test"), publicCallbackAuthority: `${panel}/auth/callback`, panelHomeAuthority: `${panel}/`, maximumQueryBytes: 4096, transport: callbackTransport, redeemer: { async redeemHandoff() { throw new Error("no session before acceptance"); }, async recoverRedemption() { throw new Error("unused"); } }, clock, audit() {}, crossHostTransfer });
    await context.route("**/*", async route => {
      const r = route.request(), u = new URL(r.url()); requested.push(r.url());
      let response;
      const headers = await r.allHeaders();
      if (u.origin === panel && u.pathname === "/invitations/accept" && r.method() === "POST") assert.equal(headers.origin, panel);
      if (u.origin !== panel) assert.equal(headers.referer, undefined);
      const request = new Request(r.url(), { method: r.method(), headers, ...(r.postData() ? { body: r.postData() } : {}) });
      if (u.origin === panel && u.pathname === "/invitations/accept") response = await handlers.accept(request);
      else if (u.origin === panel && u.pathname === "/invitations/start") response = await handlers.start(request);
      else if (u.origin === panel && u.pathname === "/invitations/confirm") response = await handlers.confirm(request);
      else if (u.origin === panel && u.pathname === "/auth/callback") response = await callback(request);
      else if (u.origin === idp && u.pathname === "/authorize") response = new Response(`<!doctype html><title>Fixture IdP</title><h1>Disposable identity fixture</h1><form action="${panel}/auth/callback"><input type="hidden" name="state" value="pinvite_fixture_0123456789"><input type="hidden" name="code" value="fixture-code"><button>Fixture kimliğini doğrula</button></form>`, { headers: { "content-type": "text/html" } });
      else if (u.origin === admin && u.pathname === "/auth/handoff" && r.method() === "POST") { assert.ok(!r.postData().includes(session)); response = new Response("<!doctype html><title>Fixture panel</title><h1>Fixture mağaza paneli</h1>", { headers: { "content-type": "text/html" } }); }
      else if (u.pathname === "/favicon.ico") response = new Response(null, { status: 204 });
      else { errors.push(`unexpected network ${u.origin}${u.pathname}`); await route.abort(); return; }
      // Route fulfillment needs separate cookie installation to preserve multiple Set-Cookie headers.
      const cookieHeaders = response.headers.getSetCookie();
      for (const c of cookieHeaders) {
        const [pair, ...attrs] = c.split("; "), separator = pair.indexOf("="), age = Number(attrs.find(a => a.startsWith("Max-Age="))?.slice(8));
        await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: u.origin, secure: true, httpOnly: true, sameSite: "Lax", expires: age === 0 ? 1 : Math.floor(Date.now() / 1000) + age }]);
      }
      const outHeaders = Object.fromEntries(response.headers); delete outHeaders["set-cookie"];
      if (outHeaders["content-type"] === "text/html") outHeaders["content-type"] = "text/html; charset=utf-8";
      await route.fulfill({ status: response.status, headers: outHeaders, body: await response.text() });
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", msg => { if (["error", "warning"].includes(msg.type()) && !msg.text().includes("503")) errors.push(msg.text()); });
    await page.goto(`${panel}/invitations/accept#token=${token}`);
    assert.equal(page.url(), `${panel}/invitations/accept`); assert.match(await page.title(), /Mağaza daveti/); assert.equal(started, 0); assert.equal(membershipWrites, 0);
    assert.ok(!(await page.content()).includes(token)); assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.keyboard.press("Tab"); assert.equal(await page.locator("#continue").evaluate(el => el === document.activeElement), true);
    const outline = await page.locator("#continue").evaluate(el => getComputedStyle(el).outlineWidth); assert.notEqual(outline, "0px");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.keyboard.press("Enter"); await page.waitForURL(`${idp}/authorize**`); assert.equal(started, 1); assert.equal(membershipWrites, 0);
    await page.getByRole("button", { name: "Fixture kimliğini doğrula" }).click(); await page.waitForURL(`${panel}/invitations/confirm`);
    assert.equal(membershipWrites, 0); assert.match(await page.locator("main").innerText(), /Fixture <Mağaza>/);
    assert.ok(!(await page.content()).includes(grant)); assert.ok(!(await page.content()).includes(browserProof));
    const before = (await context.cookies(panel)).find(c => c.name === "__Host-celebix_invitation_operation").value;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (viewport.width === 320) await page.screenshot({ path: "/tmp/celebix-invitation-confirm-320.png" });
    await page.keyboard.press("Tab"); assert.equal(await page.getByRole("button", { name: "Kabul et" }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Enter"); await page.getByRole("heading", { name: "İşlem sonucu henüz doğrulanamadı" }).waitFor();
    assert.equal(membershipWrites, 1);
    await page.getByRole("link", { name: "Tekrar kontrol et" }).click(); await page.waitForURL(`${panel}/invitations/confirm`);
    assert.equal((await context.cookies(panel)).find(c => c.name === "__Host-celebix_invitation_operation").value, before);
    await page.reload(); assert.equal((await context.cookies(panel)).find(c => c.name === "__Host-celebix_invitation_operation").value, before);
    await page.getByRole("button", { name: "Kabul et" }).click(); await page.waitForURL(`${admin}/auth/handoff`);
    assert.match(await page.locator("h1").innerText(), /Fixture mağaza paneli/); assert.equal(membershipWrites, 1); assert.equal(acceptOperations.length, 2); assert.equal(acceptOperations[0], acceptOperations[1]);
    assert.ok(requested.every(url => !url.includes(token) && !url.includes(grant) && !url.includes(session)));
    assert.deepEqual((await context.cookies(panel)).filter(c => /invitation|pre_auth|panel_session/.test(c.name)), []);
    assert.deepEqual(errors, []);
    evidence.push({ viewport, fragmentRemoved: true, explicitKeyboardConsent: true, narrowOverflow: false, safeRefreshRetry: true, membershipWrites, consoleErrors: errors });
    await context.close();
  }
  console.log(JSON.stringify({ evidence, fixtureOnly: true, realProviderOrDatabase: false, screenshot: "/tmp/celebix-invitation-confirm-320.png" }, null, 2));
} finally { await browser.close(); }
