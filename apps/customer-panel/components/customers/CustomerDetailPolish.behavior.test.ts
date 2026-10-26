import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compile, mounted, effectiveCss, source } from "../../lib/mira-final-test-support.ts";
import { CUSTOMERS, TAGS, SEGMENTS, workspace } from "../../../../tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/customers-urbanist/fixture-data.ts";
const data = CUSTOMERS[0]!;
const history = workspace(data.id);
function presentation() {
  return compile("components/customers/CustomerDetailConsole.tsx", {
    "@/lib/customer-ui/client": { CustomerApiError: Error, customerApi: {} },
    "@/components/commercial-packages/CommercialFeatureLink": { CommercialFeatureLink: () => React.createElement("a", { href: "/settings/plan", "data-commercial-capability": "growth_tools" }, "Paketi incele") },
  }).CustomerDetailPresentation;
}
const props = (overrides: Record<string, unknown> = {}) => ({ data, workspace: history, tags: TAGS, segments: SEGMENTS, segmentsAvailable: true, canManage: true, canArchive: true, busy: false, notice: "", error: "", onAddNote: () => {}, onAssign: () => {}, onArchive: () => {}, ...overrides });

test("detail groups three surfaces and puts financial summary before activity with one edit and status", async () => {
  await mounted(presentation(), props(), async (host, window) => {
    for (const name of ["profileSurface", "activitySurface", "customerInfoSurface"]) assert.equal(host.querySelectorAll(`.${name}`).length, 1, name);
    const summary = host.querySelector('[aria-label="Müşteri özeti"]'), orders = host.querySelector('[aria-label="Sipariş geçmişi"]');
    assert.ok(summary && orders);
    assert.ok(summary.compareDocumentPosition(orders) & window.Node.DOCUMENT_POSITION_FOLLOWING, "summary must precede activity in mobile DOM order");
    assert.equal(host.querySelectorAll(`a[href="/customers/${data.id}/edit"]`).length, 1);
    assert.equal([...host.querySelectorAll('[data-tone]')].filter((e: any) => e.textContent === "Aktif").length, 1);
    assert.equal([...host.querySelectorAll('p')].some((e: any) => e.textContent === `Müşteriler / ${data.displayName}`), false);
  });
});

test("detail retains contact history financial address note consent and classification facts", async () => {
  await mounted(presentation(), props(), async host => {
    const text = host.textContent;
    for (const value of [data.displayName, data.email!, data.phone!, "248.735", "12", "Varsayılan", "İstanbul", "Kadıköy", "34710", "TR", "İzinli", "Reddedildi"]) assert.ok(text.includes(value), value);
    for (const href of [`mailto:${data.email}`, `tel:${data.phone}`, "/customers", "/customers/tags", "/customers/segments", ...history.orders.map(o => `/orders/${o.id}`)]) assert.ok(host.querySelector(`a[href="${href}"]`), href);
    for (const address of data.addresses) for (const value of [address.label, address.recipientName, address.line1, address.line2].filter(Boolean)) assert.ok(text.includes(value), String(value));
    for (const item of [...data.notes.map(n => n.text), ...TAGS.map(t => t.name), ...SEGMENTS.map(s => s.name)]) assert.ok(text.includes(item), item);
    assert.equal(host.querySelector('textarea[name="text"]').required, true);
    assert.equal(host.querySelector('textarea[name="text"]').maxLength, 2000);
  });
});

test("native note assignment and explicit archive callbacks survive regrouping", async () => {
  const calls: unknown[] = [];
  await mounted(presentation(), props({ onAssign: (kind: string, ids: string[]) => calls.push([kind, ids]), onAddNote: (e: any) => { e.preventDefault(); calls.push("note"); }, onArchive: () => calls.push("archive") }), async (host, window) => {
    const controls = [...host.querySelectorAll('.taxonomyChecks input')] as any[];
    assert.equal(controls.length, TAGS.length + SEGMENTS.length);
    await act(async () => controls[0].click());
    assert.deepEqual(calls[0], ["tags", data.tags.filter(item => item.id !== TAGS[0]!.id).map(item => item.id)]);
    await act(async () => controls[TAGS.length].click());
    assert.deepEqual(calls[1], ["segments", data.segments.filter(item => item.id !== SEGMENTS[0]!.id).map(item => item.id)]);
    await act(async () => host.querySelector('form').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(calls.at(-1), "note");
    await act(async () => host.querySelector('details summary').click());
    assert.equal(calls.includes("archive"), false);
    await act(async () => host.querySelector('details button').click());
    assert.equal(calls.at(-1), "archive");
  });
});

test("read-only archived busy and growth-locked detail keep independent permission gates", async () => {
  for (const state of [{ canManage: false, canArchive: false }, { data: { ...data, status: "archived" } }, { busy: true }]) {
    await mounted(presentation(), props(state), async host => {
      assert.ok([...host.querySelectorAll('.taxonomyChecks input')].every((e: any) => e.disabled));
      if (!("busy" in state)) {
        assert.equal(host.querySelector(`a[href="/customers/${data.id}/edit"]`), null);
        assert.equal(host.querySelector('textarea[name="text"]'), null);
        assert.equal(host.querySelector('details'), null);
      }
    });
  }
  await mounted(presentation(), props({ segmentsAvailable: false }), async host => {
    const inputs = [...host.querySelectorAll('.taxonomyChecks input')] as any[];
    assert.ok(inputs.slice(0, TAGS.length).every(e => !e.disabled));
    assert.ok(inputs.slice(TAGS.length).every(e => e.disabled));
    assert.ok(host.querySelector('[data-commercial-capability="growth_tools"]'));
  });
});

test("search action uses filled graphite and inverse text with a dark hover", () => {
  const html = '<div style="--cp-action-primary:rgb(43,43,43);--cp-action-primary-text:rgb(255,253,252);--cp-action-primary-hover:rgb(32,28,25);--cp-soft:rgb(240,237,232);--cp-text-primary:rgb(43,43,43)"><div class="customerSearch"><input><button type="submit">Ara</button></div></div>';
  const css = effectiveCss("components/customers/customer-console.module.css", html, "button");
  assert.equal(css.backgroundColor, "rgb(43, 43, 43)");
  assert.equal(css.color, "rgb(255, 253, 252)");
  assert.equal(css.cursor, "pointer");
  assert.match(source("components/customers/customer-console.module.css"), /customerSearch button:hover[^}]*var\(--cp-action-primary-hover\)/);
});
