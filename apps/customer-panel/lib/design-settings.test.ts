import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("design settings is one server-authorized durable workspace", async () => {
  const [page, workspace, inspector, preview, css] = await Promise.all([
    source("app/settings/design/page.tsx"),
    source("components/settings/design/DesignWorkspace.tsx"),
    source("components/settings/design/DesignInspector.tsx"),
    source("components/settings/design/DesignPreview.tsx"),
    source("components/settings/design-settings.module.css"),
  ]);
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /configuration[.]read/);
  assert.match(page, /repository[.]getWorkspace/);
  assert.match(workspace, /styles[.]workspace/);
  assert.match(inspector, /Görsel yükle/);
  assert.match(preview, /StorefrontDesignRenderer/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /:focus/);
  assert.doesNotMatch(`${page}\n${workspace}\n${inspector}`, /localStorage|sessionStorage|storeId=|tenantContext=|provider|credential/i);
});
