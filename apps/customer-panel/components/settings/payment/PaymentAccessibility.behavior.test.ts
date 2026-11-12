import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { click, compile, input, mounted } from "../../../lib/mira-final-test-support.ts";

const method = {
  id: "51000000-0000-4000-8000-000000000001",
  kind: "cash_on_delivery",
  profileId: null,
  providerCode: null,
  label: "Kapıda ödeme",
  state: "active",
  emergencyReason: null,
  position: 0,
  config: {},
  version: 7,
};

function compileConsole() {
  const writes: unknown[] = [];
  const { PaymentSettingsConsole } = compile("components/settings/payment/PaymentSettingsConsole.tsx", {
    "@/lib/payment-method-ui/client": {
      PaymentMethodApiError: Error,
      paymentMethodApi: {
        list: async () => [method],
        catalog: async () => [],
        setState: async (id: string, command: unknown) => { writes.push({ id, command }); },
      },
    },
  });
  return { PaymentSettingsConsole, writes };
}

test("both payment tab lists associate panels and wrap keyboard focus", async () => {
  const { PaymentSettingsConsole } = compileConsole();
  await mounted(PaymentSettingsConsole, { canManage: true, storefrontHostname: null }, async (host, window) => {
    const verify = async (list: HTMLElement) => {
      const [first, last] = list.querySelectorAll<HTMLButtonElement>("[role=tab]");
      assert.ok(first && last);
      const check = (tab: HTMLButtonElement, selected: boolean) => {
        assert.equal(tab.tabIndex, selected ? 0 : -1);
        assert.equal(tab.getAttribute("aria-selected"), String(selected));
        const panel = host.querySelector(`#${tab.getAttribute("aria-controls")}`);
        assert.equal(panel?.getAttribute("role"), "tabpanel");
        assert.equal(panel?.getAttribute("aria-labelledby"), tab.id);
        assert.equal(panel?.hidden, !selected);
      };
      first.focus();
      check(first, true);
      check(last, false);
      for (const [key, target] of [["ArrowRight", last], ["ArrowRight", first], ["ArrowLeft", last], ["Home", first], ["End", last]] as const) {
        await act(async () => window.document.activeElement?.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
        assert.equal(window.document.activeElement, target);
        check(first, target === first);
        check(last, target === last);
      }
    };

    await verify(host.querySelector("[role=tablist]"));
    await click(host, "Ödeme Yöntemi Ekle");
    const dialog = host.querySelector("dialog[open]");
    assert.ok(dialog);
    assert.equal(window.document.body.style.overflow, "hidden");
    await verify(dialog.querySelector("[role=tablist]"));
    const opener = [...host.querySelectorAll("button")].find((button: HTMLButtonElement) => button.textContent === "Ödeme Yöntemi Ekle");
    await act(async () => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })));
    assert.equal(host.querySelector("dialog[open]"), null);
    assert.equal(window.document.activeElement, opener);
    assert.equal(window.document.body.style.overflow, "");
  });
});

test("payment state confirmation validates a trimmed emergency reason and preserves the versioned command", async () => {
  const { PaymentSettingsConsole, writes } = compileConsole();
  await mounted(PaymentSettingsConsole, { canManage: true, storefrontHostname: null }, async (host, window) => {
    const actions = host.querySelector("details");
    actions.open = true;
    await click(actions, "Devre dışı bırak");
    assert.ok(host.querySelector("dialog[open]"));
    assert.deepEqual(writes, []);
    await click(host.querySelector("dialog"), "Vazgeç");
    assert.deepEqual(writes, []);
    assert.equal(window.document.activeElement, actions.querySelector("summary"));

    actions.open = true;
    await click(actions, "Acil kapat");
    const dialog = host.querySelector("dialog[open]");
    const field = dialog.querySelector("input");
    const form = dialog.querySelector("form");
    const submit = () => act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    await input(window, field, "  a  ");
    await submit();
    assert.equal(field.getAttribute("aria-invalid"), "true");
    assert.deepEqual(writes, []);

    await input(window, field, "  Operasyon kontrolü  ");
    await submit();
    assert.deepEqual(writes, [{ id: method.id, command: { expectedVersion: 7, state: "emergency_disabled", emergencyReason: "Operasyon kontrolü" } }]);
    assert.equal(host.querySelector("dialog[open]"), null);
  });
});
