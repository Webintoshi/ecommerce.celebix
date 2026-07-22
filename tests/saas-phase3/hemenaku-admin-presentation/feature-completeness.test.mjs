import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");

test("renders the merchant module families as a full searchable operational console", async () => {
  const source = await read("apps/customer-panel/components/merchant-admin/MerchantModuleConsole.tsx");
  for (const contract of [
    "buildMerchantModuleSummary",
    "formatMerchantAdminConfig",
    "getMerchantModuleDefinition",
    "PanelMetricCard",
    "PanelDataTable",
    "aria-label=\"Kayıt ara\"",
    "aria-label=\"Durum filtresi\"",
    "role=\"dialog\"",
    "aria-modal=\"true\"",
    "event.key === \"Escape\"",
    "event.key !== \"Tab\"",
    "surface?.querySelectorAll",
    "!surface.contains",
    "editorTriggerRef.current?.focus()",
  ]) assert.match(source, new RegExp(contract.replaceAll("?", "\\?")));

  assert.doesNotMatch(source, /apiSecret|password|credential|privateKey|setTimeout\([^)]*send/i);
});

test("keeps every declared merchant module route backed by an actual page", async () => {
  const { MERCHANT_MODULE_DEFINITIONS } = await import(
    "../../../apps/customer-panel/lib/merchant-admin-ui/presentation.ts"
  );
  const pagePath = (route) => route === "/"
    ? "apps/customer-panel/app/(panel)/page.tsx"
    : `apps/customer-panel/app${route}/page.tsx`;

  for (const { route } of MERCHANT_MODULE_DEFINITIONS) {
    await assert.doesNotReject(access(new URL(pagePath(route), ROOT)));
  }
});

test("keeps external execution honest while preserving durable configuration", async () => {
  const definition = await read("apps/customer-panel/lib/merchant-admin-ui/presentation.ts");
  const consoleSource = await read("apps/customer-panel/components/merchant-admin/MerchantModuleConsole.tsx");
  const client = await read("apps/customer-panel/lib/merchant-admin-ui/client.ts");
  assert.match(definition, /execution:\s*"provider_required"/);
  for (const action of ["delivery", "synchronization", "reconciliation", "indexing"]) {
    assert.match(definition, new RegExp(`action: "${action}"`));
  }
  assert.match(definition, /buildProviderWorkflowState/);
  assert.match(consoleSource, /merchantAdminApi\.providerJobs/);
  assert.match(consoleSource, /merchantAdminApi\.prepareProviderJob/);
  assert.match(consoleSource, /merchantAdminApi\.cancelProviderJob/);
  assert.match(consoleSource, /awaiting_provider_activation/);
  assert.match(consoleSource, /Harici çalıştırma kapalı/);
  assert.match(consoleSource, /harici işlem çalıştırılmadı/);
  assert.match(client, /provider-jobs\/\$\{providerKind\(recordKind\)\}/);
  assert.doesNotMatch(consoleSource, /Gönderildi|Senkronizasyon tamamlandı|Fatura gönderildi|Başarıyla çalıştırıldı/);
  assert.doesNotMatch(client, /sendProvider|completeProvider|executeProvider|providerResponse/);

  await Promise.all([
    access(new URL("apps/customer-panel/app/api/merchant-admin/provider-jobs/[kind]/route.ts", ROOT)),
    access(new URL("apps/customer-panel/app/api/merchant-admin/provider-jobs/[kind]/[jobId]/cancel/route.ts", ROOT)),
  ]);
});
