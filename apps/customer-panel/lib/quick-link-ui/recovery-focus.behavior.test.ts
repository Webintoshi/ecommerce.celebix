import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { compile, input, mounted } from "../mira-final-test-support.ts";

class QuickLinkUiApiError extends Error {
  constructor(readonly code: "version_conflict", readonly status: number) { super("Synthetic version conflict"); }
}

const link = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111", customerName: "Synthetic customer",
  customerEmail: "synthetic@example.test", firstProductName: "Synthetic product", itemCount: 1,
  status: "active", totalCents: 1500, expiresAt: "2026-09-30T12:00:00.000Z", version: 7,
});
function consumer(api: Record<string, unknown>) {
  const result = compile("components/orders/QuickOrderLinksConsole.tsx", {
    "@/lib/quick-link-ui/client": { QuickLinkUiApiError, quickLinkUi: { listPaymentMethods: async () => [], ...api } },
    "@/lib/customer-ui/client": { CustomerApiError: Error, customerApi: {} },
  }).QuickOrderLinksConsole;
  return result;
}
function assertVisibleFocus(host: any, window: any) {
  const focused = window.document.activeElement;
  assert.ok(host.contains(focused), "recovery focus must remain inside the live workspace");
  assert.ok(focused.closest('.sr-only,[hidden],[aria-hidden="true"]') === null,
    "recovery focus must not land in a visually or semantically hidden ancestor");
  return focused;
}

test("cancel version conflict focuses a visible list control, retains its filter and reloads the current CAS version", async () => {
  let reads = 0;
  const cancellations: Array<readonly [string, number]> = [];
  const Component = consumer({
    listLinks: async () => ({ items: [{ ...link, version: ++reads === 1 ? 7 : 8, customerName: reads === 1 ? link.customerName : "Synthetic refreshed customer" }] }),
    cancelLink: async (id: string, version: number) => {
      cancellations.push([id, version]);
      if (cancellations.length === 1) throw new QuickLinkUiApiError("version_conflict", 409);
      return { status: "cancelled", version: 9 };
    },
  });
  await mounted(Component, {}, async (host, window) => {
    const search = host.querySelector('.linkToolbar input[type="search"]');
    await input(window, search, "Synthetic");
    const cancel = host.querySelector('button[aria-label="Linki iptal et"]');
    cancel.focus();
    await act(async () => cancel.click());
    const focused = assertVisibleFocus(host, window);
    assert.ok(focused === search, "the existing list search provides visible recovery orientation without a duplicate heading");
    assert.equal(search.value, "Synthetic");
    assert.deepEqual(cancellations, [[link.id, 7]]);
    assert.equal(reads, 2);
    assert.match(host.textContent, /Synthetic refreshed customer/);
    assert.match(host.textContent, /Synthetic version conflict/);
    await act(async () => host.querySelector('button[aria-label="Linki iptal et"]').click());
    assert.deepEqual(cancellations, [[link.id, 7], [link.id, 8]], "manual retry must use the reloaded version, never the stale one");
    assert.equal(reads, 2, "successful cancellation updates its row without another read");
    assert.match(host.textContent, /Link iptal edildi/);
    assert.equal(host.querySelector('button[aria-label="Linki iptal et"]'), null);
  });
});

test("late cancellation conflict cannot move keyboard focus into the list after switching to the visible builder", async () => {
  let reads = 0;
  let rejectCancellation!: (error: Error) => void;
  const Component = consumer({
    listLinks: async () => { reads += 1; return { items: [link] }; },
    cancelLink: async () => new Promise((_resolve, reject) => { rejectCancellation = reject; }),
  });
  await mounted(Component, {}, async (host, window) => {
    await act(async () => host.querySelector('button[aria-label="Linki iptal et"]').click());
    const create = [...host.querySelectorAll("button")].find((button: any) => button.textContent.includes("Yeni bağlantı")) as any;
    assert.ok(create);
    await act(async () => create.click());
    const builderFocus = assertVisibleFocus(host, window);
    await act(async () => rejectCancellation(new QuickLinkUiApiError("version_conflict", 409)));
    assert.equal(reads, 2);
    assert.ok(assertVisibleFocus(host, window) === builderFocus, "a late list operation must preserve the current visible builder focus");
  });
});
