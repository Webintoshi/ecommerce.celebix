import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import * as contracts from "@celebix/saas-contracts";
import { compile, mounted, input, click } from "../../customer-panel/lib/mira-final-test-support.ts";
const ID = "10000000-0000-4000-8000-000000000001";
function component() { try { return compile("../storefront-shared/components/ProductPageReviewForm.tsx", { "@celebix/saas-contracts": contracts }).ProductPageReviewForm; } catch (error) { if ((error as {code?:string}).code === "ENOENT") assert.fail("Product-page review form is not implemented"); throw error; } }
async function form(availability: unknown, run: (host: any, window: any, calls: any[]) => Promise<void>, submit: (index: number) => Response = () => Response.json({ status: "pending" })) {
  const previous = globalThis.fetch, calls: any[] = []; let writes = 0;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return options?.method === "POST" ? submit(++writes) : Response.json(availability);
  };
  try { await mounted(component(), { productId: ID, returnTo: "/urun/test" }, (host, window) => run(host, window, calls)); }
  finally { globalThis.fetch = previous; }
}
async function enter(host: any, window: any) {
  await input(window, host.querySelector('input[name="reviewerName"]'), "Ada A.");
  const body = host.querySelector("textarea");
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(body, "Ürün oldukça güzel."); body.dispatchEvent(new window.Event("input", { bubbles: true })); });
  await act(async () => host.querySelector('input[name="rating"][value="4"]').click());
}
test("disabled review writing does not render a form or poll", async () => {
  await form({ enabled: false }, async (host, _window, calls) => { assert.equal(host.textContent, ""); assert.equal(calls.length, 1); });
});
test("guests receive the existing login flow with a product return destination", async () => {
  await form({ enabled: true, state: "guest" }, async host => {
    assert.match(host.textContent, /WhatsApp/); assert.equal(host.querySelector("form"), null);
    assert.equal(host.querySelector("a").getAttribute("href"), "/account/login?returnTo=%2Furun%2Ftest");
  });
});
test("authenticated customer posts only review data and waits for moderation", async () => {
  await form({ enabled: true, state: "available" }, async (host, window, calls) => {
    await enter(host, window); await click(host, "Yorumu gönder");
    assert.match(host.textContent, /inceleme/); assert.equal(host.querySelector("form"), null);
    const post = calls.find(call => call.options?.method === "POST");
    assert.equal(post.url, `/api/products/${ID}/reviews`); assert.equal(post.options.credentials, "same-origin");
    assert.deepEqual(JSON.parse(post.options.body), { review: { reviewerName: "Ada A.", rating: 4, body: "Ürün oldukça güzel." } });
  });
});
test("uncertain submission preserves the draft and exact operation on retry", async () => {
  await form({ enabled: true, state: "available" }, async (host, window, calls) => {
    await enter(host, window); await click(host, "Yorumu gönder");
    assert.equal(host.querySelector("textarea").value, "Ürün oldukça güzel.");
    assert.equal(host.querySelector("textarea").disabled, true);
    await click(host, "Yeniden gönder");
    const posts = calls.filter(call => call.options?.method === "POST");
    assert.equal(posts.length, 2); assert.equal(posts[0].options.headers["idempotency-key"], posts[1].options.headers["idempotency-key"]);
    assert.equal(posts[0].options.body, posts[1].options.body); assert.match(host.textContent, /inceleme/);
  }, index => index === 1 ? Response.json({ message: "Bağlantı kesildi." }, { status: 503 }) : Response.json({ status: "pending" }));
});
test("previous submission is acknowledged without offering a duplicate form", async () => {
  await form({ enabled: true, state: "submitted" }, async host => { assert.match(host.textContent, /daha önce/); assert.equal(host.querySelector("form"), null); });
});
