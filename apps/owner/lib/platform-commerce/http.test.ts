import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from "node:test";

import { createPlatformCommerceHttpHandler } from "./http.ts";

const KEY = Buffer.alloc(32, 41);
const NOW = new Date("2026-10-26T12:00:00Z");
const STAMP = String(Math.floor(NOW.getTime() / 1000));
const URL = "https://owner.celebix.net/api/internal/platform-commerce";
const BODY = JSON.stringify({ action: "read", payload: { code: "buyer-private-code" } });

function headers(body = BODY, timestamp = STAMP): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-celebix-commerce-timestamp": timestamp,
    "x-celebix-commerce-signature": createHmac("sha256", KEY).update(`${timestamp}.`).update(body).digest("hex"),
  };
}

function request(body = BODY, init: RequestInit = {}, url = URL): Request {
  return new Request(url, { method: "POST", body, headers: headers(body), ...init });
}

function guardHeaders(response: Response): void {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

test("authenticated bridge commands reach execute once with an exact envelope", async () => {
  const calls: unknown[] = [];
  const handler = createPlatformCommerceHttpHandler({ key: KEY, now: () => NOW, execute: async (action, payload) => {
    calls.push({ action, payload });
    return { ok: true, state: "pending" };
  } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, state: "pending" });
  assert.deepEqual(calls, [{ action: "read", payload: { code: "buyer-private-code" } }]);
  guardHeaders(response);
});

test('real server fetch may supply sec-fetch-mode cors without weakening bridge authentication',async()=>{
  let calls=0;
  const handler=createPlatformCommerceHttpHandler({key:KEY,now:()=>NOW,execute:async()=>{calls++;return{ok:true};}});
  const server=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const rawHeaders=new Headers();for(const[name,value]of Object.entries(req.headers))if(value!==undefined)rawHeaders.set(name,Array.isArray(value)?value.join(', '):value);
    const result=await handler(new Request(URL,{method:'POST',headers:rawHeaders,body:Buffer.concat(chunks)}));
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const response=await fetch(`http://127.0.0.1:${address.port}/api/internal/platform-commerce`,{method:'POST',headers:headers(),body:BODY,redirect:'error'});
    assert.equal(response.status,200);assert.equal(calls,1);
    assert.equal((await handler(request(BODY,{headers:{...headers(),'sec-fetch-site':'same-origin'}}))).status,401);
    assert.equal((await handler(request(BODY,{headers:{...headers(),'sec-fetch-mode':'navigate'}}))).status,401);
  }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test("every supported action uses the same authenticated transport", async () => {
  const actions: string[] = [];
  const handler = createPlatformCommerceHttpHandler({ key: KEY, now: () => NOW, execute: async (action) => { actions.push(action); return { ok: true }; } });
  for (const action of ["redeem", "read", "start", "callback", "public_test"]) {
    assert.equal((await handler(request(JSON.stringify({ action, payload: {} })))).status, 200);
  }
  assert.deepEqual(actions, ["redeem", "read", "start", "callback", "public_test"]);
});

test("missing, stale, forged or browser authentication cannot invoke commerce", async () => {
  let calls = 0;
  const handler = createPlatformCommerceHttpHandler({ key: KEY, now: () => NOW, execute: async () => { calls += 1; return {}; } });
  for (const selected of [
    { "content-type": "application/json" },
    { ...headers(), "x-celebix-commerce-signature": "0".repeat(64) },
    { ...headers(), "x-celebix-commerce-signature": headers()["x-celebix-commerce-signature"].toUpperCase() },
    headers(BODY, String(Number(STAMP) - 301)), headers(BODY, String(Number(STAMP) + 301)),
    { ...headers(), origin: "https://celebix.net" },
    { ...headers(), authorization: "Bearer browser-token" },
    { ...headers(), cookie: "owner-session=private-cookie" },
    { ...headers(), "proxy-authorization": "private-credentials" },
  ]) {
    const response = await handler(request(BODY, { headers: selected }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" });
    guardHeaders(response);
  }
  assert.equal(calls, 0);
});

test("invalid authentication rejects headers before consuming a PII body stream", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const handler = createPlatformCommerceHttpHandler({ key: KEY, now: () => NOW, execute: async () => assert.fail("must not execute") });
  const req = new Request(URL, { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
  const started = Date.now();
  const response = await handler(req);
  assert.equal(response.status, 401);
  assert.equal(req.bodyUsed, false);
  assert.ok(Date.now() - started < 1000);
  await stream.cancel();
  assert.equal(cancelled, true);
});

test("body changes invalidate a previously valid HMAC before JSON parsing", async () => {
  let calls = 0;
  const handler = createPlatformCommerceHttpHandler({ key: KEY, now: () => NOW, execute: async () => { calls += 1; return {}; } });
  const changed = await handler(request(BODY + " ", { headers: headers(BODY) }));
  assert.equal(changed.status, 401);
  const malformed = await handler(request("private-PII-not-json", { headers: headers(BODY) }));
  assert.equal(malformed.status, 401);
  assert.equal(calls, 0);
});

test("wrong route, method, content type and envelopes make no financial call", async () => {
  let calls = 0;
  const handler = createPlatformCommerceHttpHandler({ key: KEY, now: () => NOW, execute: async () => { calls += 1; return {}; } });
  const requests = [
    new Request(URL, { method: "GET", headers: headers() }),
    request(BODY, {}, URL + "?action=read"), request(BODY, {}, URL + "#fragment"),
    request(BODY, {}, URL + "/other"), request(BODY, { headers: { ...headers(), "content-type": "text/plain" } }),
    ...[
      "not-json", "[]", "null", '{"action":"read","payload":[]}',
      '{"action":"read","payload":null}', '{"action":"refund","payload":{}}',
      '{"action":"read","payload":{},"extra":true}', '{"action":"read"}',
      '{"action":"start","action":"read","payload":{}}',
    ].map((body) => request(body)),
  ];
  for (const req of requests) {
    const response = await handler(req);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: "invalid_request" });
    guardHeaders(response);
  }
  assert.equal(calls, 0);
});

test("body byte cap covers streamed bytes as well as Content-Length", async () => {
  let calls = 0;
  const handler = createPlatformCommerceHttpHandler({ key: KEY, now: () => NOW, execute: async () => { calls += 1; return {}; } });
  const huge = JSON.stringify({ action: "read", payload: { description: "ğ".repeat(40_000) } });
  const response = await handler(request(huge));
  assert.equal(response.status, 400);
  assert.equal((await handler(request(BODY, { headers: { ...headers(), "content-length": "65537" } }))).status, 400);
  assert.equal(calls, 0);
});

test("slow or failing body streams end safely before execution", async () => {
  let calls = 0;
  let cancelled = false;
  const handler = createPlatformCommerceHttpHandler({ key: KEY, now: () => NOW, execute: async () => { calls += 1; return {}; } });
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const req = new Request(URL, { method: "POST", headers: headers(), body: stream, duplex: "half" } as RequestInit);
  const started = Date.now();
  assert.equal((await handler(req)).status, 400);
  assert.ok(Date.now() - started < 5000);
  assert.equal(cancelled, true);
  const broken = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("buyer private stream error")); } });
  assert.equal((await handler(new Request(URL, { method: "POST", headers: headers(), body: broken, duplex: "half" } as RequestInit))).status, 400);
  assert.equal(calls, 0);
});

test("executor errors and unserializable output have sanitized unavailable responses", async () => {
  for (const execute of [async () => { throw new Error("private buyer invoice and credential"); }, async () => ({ invalid: 1n })]) {
    const handler = createPlatformCommerceHttpHandler({ key: KEY, now: () => NOW, execute });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "service_unavailable" });
    guardHeaders(response);
  }
});
