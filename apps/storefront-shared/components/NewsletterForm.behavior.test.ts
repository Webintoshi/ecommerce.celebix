import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const load = componentLoader();
const { NewsletterForm } = load<{ NewsletterForm: React.ComponentType<{ consentLabel: string; appearance: "footer" }> }>(new URL("./NewsletterForm.tsx", import.meta.url));

test("footer newsletter requires a valid email and explicit consent before sending", async () => {
  const previous = globalThis.fetch;
  const requests: unknown[] = [];
  globalThis.fetch = async (_url, init) => { requests.push(init); return new Response(null, { status: 200 }); };
  try {
    await withProductBrowser(async ({ container, render, click, change }) => {
      await render(React.createElement(NewsletterForm, { consentLabel: "Duyurulara izin veriyorum.", appearance: "footer" }));
      const button = container.querySelector<HTMLButtonElement>('button')!;
      const email = container.querySelector<HTMLInputElement>('input[type="email"]')!;
      assert.equal(button.disabled, true);
      assert.equal(email.checkValidity(), false);
      await change('input[type="email"]', "invalid-email");
      await click('input[type="checkbox"]');
      await click('button');
      assert.equal(requests.length, 0);
      assert.equal(email.checkValidity(), false);
    });
  } finally { globalThis.fetch = previous; }
});

test("footer newsletter sends only email and consent, prevents repeat submits and resets after success", async () => {
  const previous = globalThis.fetch;
  const requests: { url: string; body: unknown }[] = [];
  let complete!: (response: Response) => void;
  globalThis.fetch = (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Promise<Response>(resolve => { complete = resolve; });
  };
  try {
    await withProductBrowser(async ({ container, render, click, change }) => {
      await render(React.createElement(NewsletterForm, { consentLabel: "Duyurulara izin veriyorum.", appearance: "footer" }));
      await change('input[type="email"]', "newsletter-fixture@example.test");
      await click('input[type="checkbox"]');
      await click('button');
      await click('button');
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0], { url: "/api/newsletter/subscriptions", body: { email: "newsletter-fixture@example.test", consent: true } });
      assert.equal(container.querySelector<HTMLButtonElement>('button')?.disabled, true);
      assert.equal(container.querySelector('[aria-live="polite"]')?.textContent, "Kaydediliyor…");
      await React.act(async () => complete(new Response(null, { status: 200 })));
      assert.equal(container.querySelector('[aria-live="polite"]')?.textContent, "Aboneliğiniz kaydedildi.");
      assert.equal(container.querySelector<HTMLInputElement>('input[type="email"]')?.value, "");
      assert.equal(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked, false);
    });
  } finally { globalThis.fetch = previous; }
});

test("footer newsletter preserves editable data and offers retry after a failed request", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  try {
    await withProductBrowser(async ({ container, render, click, change }) => {
      await render(React.createElement(NewsletterForm, { consentLabel: "Duyurulara izin veriyorum.", appearance: "footer" }));
      await change('input[type="email"]', "newsletter-fixture@example.test");
      await click('input[type="checkbox"]');
      await click('button');
      assert.equal(container.querySelector('[aria-live="polite"]')?.textContent, "Abonelik şu anda tamamlanamadı.");
      assert.equal(container.querySelector<HTMLInputElement>('input[type="email"]')?.value, "newsletter-fixture@example.test");
      assert.equal(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked, true);
      assert.equal(container.querySelector<HTMLButtonElement>('button')?.disabled, false);
    });
  } finally { globalThis.fetch = previous; }
});
