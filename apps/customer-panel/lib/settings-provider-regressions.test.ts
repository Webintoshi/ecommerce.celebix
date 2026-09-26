import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { compile, input, mounted } from "./mira-final-test-support.ts";

test("analytics saves once while pending and retains edited thresholds after failure for retry", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const settings = {
    candidateInactivityMinutes: 30, abandonedInactivityHours: 24, recoveryLinkHours: 72,
    automaticRecoveryEnabled: false, maximumMessageAttempts: 2, minimumMessageIntervalHours: 24,
    trackingPolicy: "anonymous_commerce", version: 1,
  };
  const connection = { provider: "umami", status: "active", configured: true, live: true };
  const saves: RequestInit[] = [];
  let releaseSave!: (response: Response) => void;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === "POST") {
      saves.push(options);
      return new Promise<Response>((resolve) => { releaseSave = resolve; });
    }
    return Response.json({ settings, connection });
  };
  try {
    const { AnalyticsSettingsConsole } = compile("components/analytics/AnalyticsSettingsConsole.tsx");
    await mounted(AnalyticsSettingsConsole, {}, async (host, window) => {
      await input(window, host.querySelector('[name="candidateInactivityMinutes"]'), "180");
      const form = host.querySelector("form");
      const submit = () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      await act(async () => { submit(); submit(); });
      assert.equal(saves.length, 1, "a second event before React renders must not start another save");
      assert.equal(host.querySelector('button[type="submit"]').disabled, true);
      assert.equal(host.querySelectorAll("fieldset[disabled]").length, 3);
      assert.match(host.textContent, /Kaydediliyor/);
      assert.deepEqual(JSON.parse(String(saves[0]!.body)), {
        expectedVersion: 1, candidateInactivityMinutes: 180, abandonedInactivityHours: 24,
        recoveryLinkHours: 72, automaticRecoveryEnabled: false, maximumMessageAttempts: 2,
        minimumMessageIntervalHours: 24, trackingPolicy: "anonymous_commerce",
      });
      await act(async () => { releaseSave(Response.json({ code: "unavailable" }, { status: 503 })); });
      assert.match(host.textContent, /Ayarlar kaydedilemedi/);
      assert.equal(host.querySelector('[name="candidateInactivityMinutes"]').value, "180");
      assert.equal(host.querySelector('button[type="submit"]').disabled, false);
      assert.equal(host.querySelectorAll("fieldset[disabled]").length, 0);
      await act(async () => { submit(); });
      assert.equal(saves.length, 2);
      assert.equal(JSON.parse(String(saves[1]!.body)).candidateInactivityMinutes, 180);
      await act(async () => {
        releaseSave(Response.json({ settings: { ...settings, candidateInactivityMinutes: 180, version: 2 } }));
      });
      assert.match(host.textContent, /Analitik ayarları kaydedildi/);
      assert.equal(host.querySelector('button[type="submit"]').disabled, false);
    }, (window) => { globalThis.FormData = window.FormData as unknown as typeof FormData; });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }
});

test("domain creation saves once while pending and retains the hostname and loaded rows after failure", async () => {
  const domain = {
    id: "domain-1", hostname: "loaded.example.com", hostnameType: "custom_domain",
    status: "pending", primary: false, uiStatus: "dns_pending", dnsInstructions: [], version: 1,
  };
  let saves = 0;
  let rejectSave!: (error: Error) => void;
  const { StoreDomainSettings } = compile("components/settings/domains/StoreDomainSettings.tsx", {
    "@/lib/store-domain-ui/client": {
      StoreDomainApiError: Error,
      storeDomainApi: {
        list: async () => [domain], listReplacements: async () => [],
        create: async (hostname: string) => {
          assert.equal(hostname, "retry.example.com");
          saves += 1;
          return new Promise((_resolve, reject) => { rejectSave = reject; });
        },
      },
    },
    "@/lib/admin-domain-ui/client": { adminDomainApi: { list: async () => [] } },
  });
  await mounted(StoreDomainSettings, { canManage: true }, async (host, window) => {
    await input(window, host.querySelector("#custom-domain"), "retry.example.com");
    const form = host.querySelector("form");
    const submit = () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await act(async () => { submit(); submit(); });
    assert.equal(saves, 1, "a second event before React renders must not create another domain");
    assert.equal(host.querySelector('button[type="submit"]').disabled, true);
    await act(async () => { rejectSave(new Error("Fixture save rejected")); });
    assert.equal(host.querySelector("#custom-domain").value, "retry.example.com");
    assert.match(host.textContent, /Fixture save rejected/);
    assert.match(host.textContent, /loaded.example.com/);
    assert.equal(host.querySelector('button[type="submit"]').disabled, false);
    await act(async () => { submit(); });
    assert.equal(saves, 2, "failure must release the lock so the same hostname can be retried");
    await act(async () => { rejectSave(new Error("Fixture retry rejected")); });
  });
  await mounted(StoreDomainSettings, { canManage: false }, async (host) => {
    assert.equal(host.querySelector("form"), null);
    assert.equal(host.querySelector(".actions"), null);
    assert.match(host.textContent, /loaded.example.com/);
  });
});
