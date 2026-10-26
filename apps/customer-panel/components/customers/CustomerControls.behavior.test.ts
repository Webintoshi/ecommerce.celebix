import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compile, input, mounted } from "../../lib/mira-final-test-support.ts";

const now = "2026-10-26T12:00:00Z";
const ada = { id: "81000000-0000-4000-8000-000000000001", status: "active", displayName: "Ada Test", firstName: "Ada", lastName: "Test", email: "ada@example.test", phone: "+905551112233", orderCount: 2, totalSpentCents: 25000, currency: "TRY", tags: [], version: 1, createdAt: now, updatedAt: now };
const deniz = { ...ada, id: "81000000-0000-4000-8000-000000000002", displayName: "Deniz Test", firstName: "Deniz", email: "deniz@example.test" };

function listComponent(searches: string[] = []) {
  return compile("components/customers/CustomerListConsole.tsx", {
    "@/lib/customer-ui/client": { CustomerApiError: Error, customerApi: {
      summary: async () => ({ active: 2, archived: 0, consentedEmail: 0, totalSpentCents: 50000, currency: "TRY", asOf: now }),
      list: async ({ search }: { search?: string }) => {
        searches.push(search ?? "");
        return { items: search === "Ada" ? [ada] : search === "Deniz" ? [deniz] : [] };
      },
    } },
  }).CustomerListConsole;
}

test("customer search labels own one control and the action remains a named native submit button", async () => {
  await mounted(listComponent(), { canManage: true, embedded: true }, async host => {
    const form = host.querySelector('form[role="search"]');
    const search = form.querySelector('input[aria-label="Müşteri ara"]');
    const submit = form.querySelector('button[type="submit"]');
    assert.ok(search);
    assert.ok(submit);
    assert.equal(submit.textContent, "Ara");
    assert.equal(search.form, form);
    assert.equal(submit.form, form);
    for (const label of form.querySelectorAll("label")) {
      assert.ok(label.querySelectorAll("button,input,select,textarea").length <= 1, "one label must not own both a text field and an action");
    }
    assert.equal(submit.closest("label"), null, "the search action must not activate the text field's label");
  });
});

test("customer search click and native form submission preserve trimmed queries and button focus", async () => {
  const searches: string[] = [];
  await mounted(listComponent(searches), { canManage: true, embedded: true }, async (host, window) => {
    const form = host.querySelector('form[role="search"]');
    const search = form.querySelector('input[aria-label="Müşteri ara"]');
    const submit = form.querySelector('button[type="submit"]');
    await input(window, search, " Ada ");
    assert.deepEqual(searches, [""], "typing alone must not change the applied search");
    await act(async () => { submit.focus(); submit.click(); });
    assert.deepEqual(searches, ["", "Ada"]);
    assert.equal(window.document.activeElement, submit);
    assert.ok(host.querySelector(`a[href="/customers/${ada.id}"]`));
    await input(window, search, " Deniz ");
    // Happy DOM has no implicit Enter activation. requestSubmit exercises the
    // native form submit path used by Enter; keyboard activation is browser QA.
    await act(async () => form.requestSubmit());
    assert.deepEqual(searches, ["", "Ada", "Deniz"]);
    assert.equal(search.value, " Deniz ");
    assert.ok(host.querySelector(`a[href="/customers/${deniz.id}"]`));
    assert.equal(host.querySelector(`a[href="/customers/${ada.id}"]`), null);
  });
});

test("customer workspace retains its action and permission gate with default primary or requested secondary styling", async () => {
  const panel = compile("components/panel/PanelPageShell.tsx", { "./PanelTopbarChrome": { PanelTopbarBridge: () => null } });
  const Component = compile("components/customers/CustomerWorkspace.tsx", {
    "@/components/panel/PanelPageShell": panel,
    "next/navigation": { usePathname: () => "/customers/tags" },
  }).CustomerWorkspace;
  for (const [props, primary] of [[{ canManage: true }, true], [{ canManage: true, primaryCustomerAction: false }, false]] as const) {
    await mounted(Component, { ...props, children: React.createElement("p", null, "Customer content") }, async host => {
      const action = host.querySelector('a[href="/customers/new"]');
      assert.ok(action);
      assert.match(action.textContent, /Yeni müşteri/);
      assert.equal(action.classList.contains("primaryAction"), primary);
      assert.equal(action.classList.contains("action"), !primary);
      assert.match(host.textContent, /Customer content/);
    });
  }
  await mounted(Component, { canManage: false }, async host => {
    assert.equal(host.querySelector('a[href="/customers/new"]'), null);
  });
});

test("tag and segment pages request the secondary customer action without changing their management gate", async () => {
  for (const kind of ["tags", "segments"]) {
    const page = compile(`app/(panel)/customers/${kind}/page.tsx`, {
      "@/lib/server-access": { requireServerPanelAccess: async () => ({ tenantContext: { membership: { role: "store_owner" } } }) },
    });
    const tree = await page.default();
    assert.equal(tree.props.canManage, true);
    assert.equal(tree.props.primaryCustomerAction, false);
    assert.equal(tree.props.children.props.kind, kind);
    assert.equal(tree.props.children.props.canManage, true);
  }
});
