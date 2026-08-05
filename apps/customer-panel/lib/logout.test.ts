import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPanelSessionStore, createPanelSession } from "./session.ts";

type LogoutModule = typeof import("./logout");
const logout = await import(new URL("./logout.ts", import.meta.url).href).catch(
  () => ({} as Partial<LogoutModule>),
);

const NOW = new Date("2026-07-11T10:00:00.000Z");

test("exports a dependency-injected logout handler", () => {
  assert.equal(typeof logout.createPanelLogoutHandler, "function");
});

test("authenticated logout destroys the server session before clearing the cookie", async () => {
  if (!logout.createPanelLogoutHandler) return;
  const store = new InMemoryPanelSessionStore();
  const session = createPanelSession({
    principal: { id: "principal_1", issuer: "https://identity.example.test", subject: "subject_1" },
    now: NOW,
  });
  await store.create(session);
  const handler = logout.createPanelLogoutHandler({
    enabled: true,
    sessionStore: store,
    cookiePolicy: { kind: "production" },
  });
  const response = await handler(new Request("https://panel.celebix.site/auth/logout", {
    method: "POST",
    headers: {
      origin: "https://panel.celebix.site",
      cookie: `__Host-celebix_panel=${session.id}`,
    },
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://panel.celebix.site/login");
  assert.equal(await store.read(session.id), null);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(response.headers.get("location")?.includes(session.id), false);
  assert.equal((await response.text()).includes(session.id), false);
});

test("logout fails closed when server-side revocation fails", async () => {
  if (!logout.createPanelLogoutHandler) return;
  const handler = logout.createPanelLogoutHandler({
    enabled: true,
    sessionStore: {
      async create() {},
      async read() { return null; },
      async rotate() {},
      async destroy() { throw new Error("private session backend detail"); },
    },
    cookiePolicy: { kind: "production" },
  });
  const response = await handler(new Request("https://panel.celebix.site/auth/logout", {
    method: "POST",
    headers: {
      origin: "https://panel.celebix.site",
      cookie: "__Host-celebix_panel=session_opaque_1234567890abcdefghijklmnop",
    },
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.equal((await response.text()).includes("private session backend detail"), false);
});

test("malformed cookies are cleared without becoming session authority", async () => {
  if (!logout.createPanelLogoutHandler) return;
  let destroys = 0;
  const handler = logout.createPanelLogoutHandler({
    enabled: true,
    sessionStore: {
      async create() {},
      async read() { return null; },
      async rotate() {},
      async destroy() { destroys += 1; },
    },
    cookiePolicy: { kind: "production" },
  });
  const response = await handler(new Request("https://panel.celebix.site/auth/logout", {
    method: "POST",
    headers: {
      origin: "https://panel.celebix.site",
      cookie: "__Host-celebix_panel=malformed!cookie",
    },
  }));
  assert.equal(response.status, 303);
  assert.equal(destroys, 0);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("disabled live logout remains fail-closed after exact Origin validation", async () => {
  if (!logout.createPanelLogoutHandler) return;
  const handler = logout.createPanelLogoutHandler({
    enabled: false,
    sessionStore: new InMemoryPanelSessionStore(),
    cookiePolicy: { kind: "production" },
  });
  const crossSite = await handler(new Request("https://panel.celebix.site/auth/logout", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  }));
  assert.equal(crossSite.status, 403);
  const disabled = await handler(new Request("https://panel.celebix.site/auth/logout", {
    method: "POST",
    headers: { origin: "https://panel.celebix.site" },
  }));
  assert.equal(disabled.status, 503);
  assert.equal(disabled.headers.has("set-cookie"), false);
  assert.equal(disabled.headers.has("location"), false);
});
