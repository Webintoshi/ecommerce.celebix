import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

test("homepage builder has one server-owned write surface and no browser tenant authority", async () => {
  const [builder, workspace, client, handler] = await Promise.all([
    read("apps/customer-panel/components/settings/design/HomepageBuilder.tsx"),
    read("apps/customer-panel/components/settings/design/DesignWorkspace.tsx"),
    read("apps/customer-panel/lib/storefront-design-ui/client.ts"),
    read("apps/customer-panel/lib/storefront-design-http/handler.ts"),
  ]);
  assert.doesNotMatch(builder, /fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|storeId|tenantId|x-store-id|qualityScore\s*:/i);
  assert.match(builder, /onChange\(\{\s*[.][.][.]design,\s*composition:\s*next/);
  assert.match(workspace, /canManage/);
  assert.match(client, /expectedDraftVersion/);
  assert.match(handler, /access[.]tenantContext/);
  assert.doesNotMatch(`${builder}\n${workspace}\n${client}`, /password|secret|bearer\s|authorization\s*:|accessToken|refreshToken|sessionToken/i);
});

test("mobile and assistive-technology contract is explicit rather than inferred", async () => {
  const [builder, css] = await Promise.all([
    read("apps/customer-panel/components/settings/design/HomepageBuilder.tsx"),
    read("apps/customer-panel/components/settings/design-settings.module.css"),
  ]);
  for (const label of ["Bölüm ekle", "Sırala", "Düzenle", "Yukarı taşı", "Aşağı taşı", "Geri al"]) assert.match(builder, new RegExp(label, "i"));
  assert.match(builder, /aria-live=["']polite["']/);
  assert.match(builder, /event[.]key === ["']Escape["']/);
  assert.match(builder, /focus\(\)/);
  assert.match(builder, /className=\{styles[.]homepageInspectorBackdrop\}/);
  assert.match(css, /[.]homepageSectionActions button\s*\{[^}]*width:\s*48px;[^}]*height:\s*48px/s);
  assert.match(css, /@media \(max-width:\s*390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /[.]01ms/);
});

test("stable IDs and derived scoring contain no secret or durable score fields", async () => {
  const sources = await Promise.all([
    read("packages/saas-contracts/src/storefront-design/validation.ts"),
    read("apps/customer-panel/components/settings/design/homepage-command-model.ts"),
    read("apps/customer-panel/components/settings/design/homepage-quality-model.ts"),
    read("apps/owner/scripts/sql/saas/202608110100_modular_homepage_builder.up.sql"),
  ]);
  const combined = sources.join("\n");
  assert.match(combined, /sectionId/);
  assert.match(combined, /count\(DISTINCT section[.]value->>'sectionId'\)/);
  assert.doesNotMatch(combined, /BEGIN (?:RSA|OPENSSH) PRIVATE KEY|AKIA[0-9A-Z]{16}|sk_(?:live|test)_[A-Za-z0-9]+/);
  assert.doesNotMatch(sources.at(-1), /qualityScore|quality_score/);
});
