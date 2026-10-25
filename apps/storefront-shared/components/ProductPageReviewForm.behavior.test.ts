import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, StrictMode } from "react";
import * as contracts from "@celebix/saas-contracts";
import { compile, mounted, input, click } from "../../customer-panel/lib/mira-final-test-support.ts";
import { readProductReviewDraft, writeProductReviewDraft, type ProductReviewDraft } from "../lib/reviews/product-page-draft.ts";

const ID = "10000000-0000-4000-8000-000000000001";
const OTHER_ID = "10000000-0000-4000-8000-000000000002";
const OPERATION = "20000000-0000-4000-8000-000000000001";
const RETURN_TO = "/urun/test";
const FIELDS = { reviewerName: "  Ada A.  ", title: "  İlk izlenim  ", body: "  Ürün\n oldukça güzel.  ", rating: 4 };
const REVIEW = { reviewerName: "Ada A.", title: "İlk izlenim", body: "Ürün oldukça güzel.", rating: 4 };
type Call = { url: unknown; options?: RequestInit };
type FormOptions = {
  setup?: (window: any) => void;
  submit?: (index: number) => Response | Promise<Response>;
  strict?: boolean;
  productId?: string;
  returnTo?: string;
};
function component() {
  return compile("../storefront-shared/components/ProductPageReviewForm.tsx", { "@celebix/saas-contracts": contracts }).ProductPageReviewForm;
}
function draft(phase: "awaiting-auth" | "sending" | "uncertain" = "awaiting-auth"): ProductReviewDraft {
  return { version: 1, productId: ID, returnTo: RETURN_TO, savedAt: Date.now(), fields: FIELDS, pending: { operationId: OPERATION, review: REVIEW, phase } };
}
function seed(window: any, value = draft()) {
  assert.equal(writeProductReviewDraft(window.sessionStorage, value), true);
}
function stored(window: any) { return readProductReviewDraft(window.sessionStorage, ID, RETURN_TO); }
function snapshot(window: any): [string, string][] {
  return Array.from({ length: window.sessionStorage.length }, (_, index) => {
    const key = window.sessionStorage.key(index)!;
    return [key, window.sessionStorage.getItem(key)!];
  });
}
function restore(window: any, entries: [string, string][]) { for (const [key, value] of entries) window.sessionStorage.setItem(key, value); }
function posts(calls: Call[]) { return calls.filter(call => call.options?.method === "POST"); }
async function form(availability: unknown, run: (host: any, window: any, calls: Call[], navigations: string[]) => Promise<void>, options: FormOptions = {}) {
  const previous = globalThis.fetch, calls: Call[] = [], navigations: string[] = []; let writes = 0;
  globalThis.fetch = async (url, request) => {
    calls.push({ url, options: request });
    return request?.method === "POST" ? (options.submit?.(++writes) ?? Response.json({ status: "pending" })) : Response.json(typeof availability === "function" ? availability() : availability);
  };
  const ReviewForm = component();
  const Render = options.strict ? (props: any) => createElement(StrictMode, null, createElement(ReviewForm, props)) : ReviewForm;
  try {
    await mounted(Render, { productId: options.productId ?? ID, returnTo: options.returnTo ?? RETURN_TO }, (host, window) => run(host, window, calls, navigations), window => {
      window.location.assign = destination => { navigations.push(String(destination)); };
      options.setup?.(window);
    });
  } finally { globalThis.fetch = previous; }
}
async function pageShow(window: any, persisted: boolean) {
  await act(async () => {
    const event = new window.Event("pageshow");
    Object.defineProperty(event, "persisted", { value: persisted });
    window.dispatchEvent(event);
  });
}
async function enter(host: any, window: any) {
  await input(window, host.querySelector('input[name="reviewerName"]'), FIELDS.reviewerName);
  await input(window, host.querySelector('input[name="title"]'), FIELDS.title);
  const body = host.querySelector("textarea");
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(body, FIELDS.body);
    body.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await act(async () => host.querySelector('input[name="rating"][value="4"]').click());
}

// Removing the guest form, or defaulting its rating, would block writing before verification.
test("guests can write and rate before WhatsApp verification", async () => {
  await form({ enabled: true, state: "guest" }, async (host, _window, calls, navigations) => {
    assert.ok(host.querySelector("form"), "Guest review fields must be immediately available");
    assert.equal(host.querySelectorAll('input[name="rating"]').length, 5);
    assert.equal(host.querySelectorAll('input[name="rating"]:checked').length, 0);
    assert.equal(host.querySelector('input[name="reviewerName"]').maxLength, 120);
    assert.equal(host.querySelector('input[name="title"]').maxLength, 200);
    assert.equal(host.querySelector("textarea").maxLength, 2000);
    assert.match(host.textContent, /WhatsApp/);
    assert.match(host.textContent, /Yorumumu gönder/);
    assert.equal(host.querySelector('button[type="submit"]').disabled, true);
    assert.equal(posts(calls).length, 0); assert.deepEqual(navigations, []);
    assert.equal(_window.document.activeElement, _window.document.body);
  });
});

// Navigating before saving, or posting while guest, loses intent or bypasses the auth boundary.
test("guest submit saves exact fields and one operation before opening existing login", async () => {
  await form({ enabled: true, state: "guest" }, async (host, window, calls, navigations) => {
    await enter(host, window);
    assert.match(host.textContent, /4.*5/);
    await click(host, "Yorumumu gönder");
    const saved = stored(window)!;
    assert.deepEqual(saved.fields, FIELDS);
    assert.equal(saved.pending?.phase, "awaiting-auth");
    assert.match(saved.pending!.operationId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(saved.pending?.review, REVIEW);
    assert.equal(posts(calls).length, 0);
    assert.deepEqual(navigations, ["/account/login?returnTo=%2Furun%2Ftest"]);
    await act(async () => { host.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(navigations.length, 1);
    assert.equal(stored(window)?.pending?.operationId, saved.pending?.operationId);
  });
});

// Returning without verification cancels the send intent while preserving the written review.
test("canceling verification keeps fields but disarms automatic send on a later authenticated visit", async () => {
  let saved: [string, string][] = [];
  await form({ enabled: true, state: "guest" }, async (host, window, calls, navigations) => {
    assert.equal(host.querySelector('input[name="reviewerName"]').value, FIELDS.reviewerName);
    assert.equal(host.querySelector('input[name="title"]').value, FIELDS.title);
    assert.equal(host.querySelector("textarea").value, FIELDS.body);
    assert.equal(host.querySelector("textarea").disabled, false);
    assert.equal(host.querySelector('input[name="rating"]:checked').value, "4");
    assert.deepEqual(stored(window)?.fields, FIELDS);
    assert.equal(stored(window)?.pending, null);
    assert.equal(posts(calls).length, 0); assert.deepEqual(navigations, []);
    assert.equal(window.document.activeElement, window.document.body);
    saved = snapshot(window);
  }, { setup: window => seed(window) });
  await form({ enabled: true, state: "available" }, async (host, _window, calls, navigations) => {
    assert.equal(host.querySelector("textarea").value, FIELDS.body);
    assert.equal(host.querySelector("textarea").disabled, false);
    assert.equal(posts(calls).length, 0); assert.deepEqual(navigations, []);
  }, { setup: window => restore(window, saved) });
});

test("a fresh explicit guest send after cancellation arms a new saved operation", async () => {
  await form({ enabled: true, state: "guest" }, async (host, window, calls, navigations) => {
    assert.equal(stored(window)?.pending, null);
    await click(host, "Yorumumu gönder");
    assert.equal(stored(window)?.pending?.phase, "awaiting-auth");
    assert.notEqual(stored(window)?.pending?.operationId, OPERATION);
    assert.deepEqual(stored(window)?.fields, FIELDS);
    assert.equal(posts(calls).length, 0);
    assert.deepEqual(navigations, ["/account/login?returnTo=%2Furun%2Ftest"]);
  }, { setup: window => seed(window) });
});

// Browser Back can restore the existing React tree instead of mounting a new one.
test("persisted Back from verification unlocks the form and cancels the saved send intent", async () => {
  await form({ enabled: true, state: "guest" }, async (host, window, calls, navigations) => {
    await enter(host, window); await click(host, "Yorumumu gönder");
    assert.equal(host.querySelector("textarea").disabled, true);
    await pageShow(window, false);
    assert.equal(calls.length, 1); assert.equal(host.querySelector("textarea").disabled, true);
    await pageShow(window, true);
    assert.equal(calls.length, 2);
    assert.equal(host.querySelector("textarea").value, FIELDS.body);
    assert.equal(host.querySelector("textarea").disabled, false);
    assert.equal(stored(window)?.pending, null); assert.deepEqual(stored(window)?.fields, FIELDS);
    assert.equal(posts(calls).length, 0); assert.equal(navigations.length, 1);
    await click(host, "Yorumumu gönder");
    assert.equal(navigations.length, 2); assert.equal(stored(window)?.pending?.phase, "awaiting-auth");
  });
});

test("a persisted authenticated return refreshes availability and resumes the same intent once", async () => {
  let authenticated = false;
  await form(() => ({ enabled: true, state: authenticated ? "available" : "guest" }), async (host, window, calls, navigations) => {
    await enter(host, window); await click(host, "Yorumumu gönder");
    const operation = stored(window)?.pending?.operationId;
    authenticated = true;
    await pageShow(window, true);
    assert.equal(posts(calls).length, 1);
    assert.equal((posts(calls)[0].options!.headers as Record<string, string>)["idempotency-key"], operation);
    assert.deepEqual(JSON.parse(posts(calls)[0].options!.body as string), { review: REVIEW });
    assert.match(host.textContent, /inceleme/); assert.equal(host.querySelector("form"), null);
    const readCount = calls.length;
    await pageShow(window, true);
    assert.equal(calls.length, readCount); assert.equal(navigations.length, 1);
  });
});

test("an expired intent on persisted authenticated return retains fields without automatic submission", async () => {
  let authenticated = false;
  await form(() => ({ enabled: true, state: authenticated ? "available" : "guest" }), async (host, window, calls, navigations) => {
    await enter(host, window); await click(host, "Yorumumu gönder");
    const savedAt = stored(window)!.savedAt;
    authenticated = true;
    const previousNow = Date.now;
    try {
      Date.now = () => savedAt + 30 * 60 * 1000 + 1;
      await pageShow(window, true);
    } finally { Date.now = previousNow; }
    assert.equal(posts(calls).length, 0);
    assert.equal(host.querySelector("textarea").value, FIELDS.body);
    assert.equal(host.querySelector("textarea").disabled, false);
    assert.equal(host.querySelector('input[name="reviewerName"]').value, FIELDS.reviewerName);
    assert.equal(stored(window)?.pending ?? null, null);
    assert.equal(navigations.length, 1);
  });
});

// Losing partial edits across a refresh would make interruption discard the customer's work.
test("partial edits survive a refresh without marking an automatic submission intent", async () => {
  let saved: [string, string][] = [];
  await form({ enabled: true, state: "guest" }, async (host, window) => {
    await input(window, host.querySelector('input[name="reviewerName"]'), "A");
    assert.equal(stored(window)?.pending, null);
    saved = snapshot(window);
  });
  await form({ enabled: true, state: "available" }, async (host, _window, calls) => {
    assert.equal(host.querySelector('input[name="reviewerName"]').value, "A");
    assert.equal(host.querySelectorAll('input[name="rating"]:checked').length, 0);
    assert.equal(posts(calls).length, 0);
  }, { setup: window => restore(window, saved) });
});

// A second effect or second click must not create a second operation after verification.
test("authenticated return restores the review and auto-submits the saved operation once in StrictMode", async () => {
  let resolve!: (response: Response) => void;
  const response = new Promise<Response>(done => { resolve = done; });
  const scrolls: { element: unknown; options: unknown }[] = [];
  await form({ enabled: true, state: "available" }, async (host, window, calls, navigations) => {
    assert.equal(host.querySelector('input[name="reviewerName"]').value, FIELDS.reviewerName);
    assert.equal(host.querySelector("textarea").value, FIELDS.body);
    assert.equal(host.querySelector("textarea").disabled, true);
    assert.equal(stored(window)?.pending?.phase, "sending");
    assert.equal(scrolls.length, 1);
    assert.equal(scrolls[0].element, host.querySelector("section"));
    assert.deepEqual(scrolls[0].options, { block: "start" });
    assert.equal(window.document.activeElement, host.querySelector("h2"));
    assert.equal(posts(calls).length, 1);
    const post = posts(calls)[0];
    assert.equal((post.options!.headers as Record<string, string>)["idempotency-key"], OPERATION);
    assert.deepEqual(JSON.parse(post.options!.body as string), { review: REVIEW });
    await act(async () => { host.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(posts(calls).length, 1);
    await act(async () => { resolve(Response.json({ status: "pending" })); });
    assert.match(host.textContent, /inceleme/); assert.equal(host.querySelector("form"), null);
    assert.equal(stored(window), null); assert.deepEqual(navigations, []);
  }, { strict: true, setup: window => {
    seed(window);
    window.HTMLElement.prototype.scrollIntoView = function(options: unknown) { scrolls.push({ element: this, options }); };
  }, submit: () => response });
});

// An in-flight request persisted across reload is ambiguous; only an explicit exact retry is safe.
for (const phase of ["sending", "uncertain"] as const) {
  test(`reload of ${phase} intent keeps fields locked and only retries the exact operation on request`, async () => {
    await form({ enabled: true, state: "available" }, async (host, window, calls) => {
      assert.equal(posts(calls).length, 0);
      assert.equal(host.querySelector("textarea").value, FIELDS.body);
      assert.equal(host.querySelector("textarea").disabled, true);
      await click(host, "Aynı yorumu yeniden gönder");
      assert.equal(posts(calls).length, 1);
      assert.equal((posts(calls)[0].options!.headers as Record<string, string>)["idempotency-key"], OPERATION);
      assert.deepEqual(JSON.parse(posts(calls)[0].options!.body as string), { review: REVIEW });
      assert.match(host.textContent, /inceleme/); assert.equal(stored(window), null);
    }, { setup: window => seed(window, draft(phase)) });
  });
}

// A disabled setting cancels saved intent before it can auto-submit after login.
test("disabled review writing clears pending intent, renders nothing and does not poll", async () => {
  await form({ enabled: false }, async (host, window, calls) => {
    assert.equal(host.textContent, ""); assert.equal(calls.length, 1); assert.equal(stored(window), null);
  }, { setup: window => seed(window) });
});

// A store can disable reviews while an already open product page is being completed.
test("a disabled response during submit cancels the saved intent and hides the form", async () => {
  await form({ enabled: true, state: "available" }, async (host, window, calls) => {
    await enter(host, window); await click(host, "Yorumumu gönder");
    assert.equal(posts(calls).length, 1);
    assert.equal(host.textContent, ""); assert.equal(stored(window), null);
  }, { submit: () => Response.json({ code: "disabled", message: "Bu mağaza şu anda yeni yorum almıyor." }, { status: 403 }) });
});

// Product or destination mismatch must never reuse another product's saved operation.
test("another product's draft cannot populate or submit the current product", async () => {
  await form({ enabled: true, state: "available" }, async (host, window, calls) => {
    assert.equal(host.querySelector('input[name="reviewerName"]').value, "");
    assert.equal(host.querySelector("textarea").value, ""); assert.equal(posts(calls).length, 0);
    assert.equal(readProductReviewDraft(window.sessionStorage, OTHER_ID, "/products/other")?.pending?.operationId, OPERATION);
  }, { setup: window => seed(window, { ...draft(), productId: OTHER_ID, returnTo: "/products/other" }) });
});
test("a different product pathname rejects saved automatic intent", async () => {
  await form({ enabled: true, state: "available" }, async (host, window, calls) => {
    assert.equal(host.querySelector('input[name="reviewerName"]').value, "");
    assert.equal(posts(calls).length, 0); assert.equal(stored(window), null);
  }, { setup: window => seed(window, { ...draft(), returnTo: "/products/different" }) });
});

// Storage failures must keep the customer on the populated form, with no unauthenticated POST.
for (const failure of ["throws", "drops"] as const) {
  test(`guest remains on the form when session storage ${failure} the saved intent`, async () => {
    await form({ enabled: true, state: "guest" }, async (host, window, calls, navigations) => {
      await enter(host, window);
      await click(host, "Yorumumu gönder");
      assert.equal(posts(calls).length, 0); assert.deepEqual(navigations, []);
      assert.equal(host.querySelector("textarea").value, FIELDS.body);
      assert.equal(host.querySelector("textarea").disabled, false);
      assert.match(host.querySelector('[role="alert"]').textContent, /saklan|kayded/);
    }, { setup: window => { Object.defineProperty(window, "sessionStorage", { configurable: true, value: { getItem: () => null, removeItem: () => {}, setItem: () => { if (failure === "throws") throw new Error("blocked"); } } }); } });
  });
}

// Normal signed-in review creation must retain its existing endpoint and moderation behavior.
test("authenticated customer posts only review data and waits for moderation", async () => {
  await form({ enabled: true, state: "available" }, async (host, window, calls, navigations) => {
    await enter(host, window); await click(host, "Yorumumu gönder");
    assert.match(host.textContent, /inceleme/); assert.equal(host.querySelector("form"), null);
    const post = posts(calls)[0];
    assert.equal(post.url, `/api/products/${ID}/reviews`); assert.equal(post.options!.credentials, "same-origin");
    assert.deepEqual(JSON.parse(post.options!.body as string), { review: REVIEW });
    assert.equal(stored(window), null); assert.deepEqual(navigations, []);
  });
});

// A known unauthenticated response is safe to resume with the same operation after login.
test("a 401 response preserves the exact operation and opens existing login", async () => {
  await form({ enabled: true, state: "available" }, async (host, window, calls, navigations) => {
    await enter(host, window); await click(host, "Yorumumu gönder");
    assert.equal(posts(calls).length, 1);
    assert.deepEqual(navigations, ["/account/login?returnTo=%2Furun%2Ftest"]);
    assert.equal(stored(window)?.pending?.phase, "awaiting-auth");
    assert.equal(stored(window)?.pending?.operationId, (posts(calls)[0].options!.headers as Record<string, string>)["idempotency-key"]);
    assert.deepEqual(stored(window)?.fields, FIELDS); assert.deepEqual(stored(window)?.pending?.review, REVIEW);
  }, { submit: () => Response.json({ message: "Giriş yapın." }, { status: 401 }) });
});

// An unknown outcome must lock editing and retain both payload and idempotency key for retry.
test("uncertain submission preserves its exact operation and raw draft on retry", async () => {
  await form({ enabled: true, state: "available" }, async (host, window, calls) => {
    await enter(host, window); await click(host, "Yorumumu gönder");
    assert.equal(host.querySelector("textarea").value, FIELDS.body);
    assert.equal(host.querySelector("textarea").disabled, true);
    assert.equal(stored(window)?.pending?.phase, "uncertain");
    await click(host, "Aynı yorumu yeniden gönder");
    const sent = posts(calls);
    assert.equal(sent.length, 2);
    assert.equal((sent[0].options!.headers as Record<string, string>)["idempotency-key"], (sent[1].options!.headers as Record<string, string>)["idempotency-key"]);
    assert.equal(sent[0].options!.body, sent[1].options!.body); assert.match(host.textContent, /inceleme/);
  }, { submit: index => index === 1 ? Response.json({ message: "Bağlantı kesildi." }, { status: 503 }) : Response.json({ status: "pending" }) });
});

// An already received review must not offer a second form or replay a pending draft.
test("previous submission is acknowledged and clears saved intent without a duplicate form", async () => {
  await form({ enabled: true, state: "submitted" }, async (host, window, calls) => {
    assert.match(host.textContent, /daha önce/); assert.equal(host.querySelector("form"), null);
    assert.equal(posts(calls).length, 0); assert.equal(stored(window), null);
  }, { setup: window => seed(window) });
});
