import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("design settings is one server-authorized visual storefront workspace", async () => {
  const [page, workspace, stepEditor, inspector, preview, canvas, drawer, css] = await Promise.all([
    source("app/settings/design/page.tsx"),
    source("components/settings/design/DesignWorkspace.tsx"),
    source("components/settings/design/DesignStepEditor.tsx"),
    source("components/settings/design/DesignInspector.tsx"),
    source("components/settings/design/DesignPreview.tsx"),
    source("components/settings/design/VisualStorefrontCanvas.tsx"),
    source("components/settings/design/DesignSettingsDrawer.tsx"),
    source("components/settings/design-settings.module.css"),
  ]);
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /configuration[.]read/);
  assert.match(page, /repository[.]getWorkspace/);
  assert.match(workspace, /styles[.]workspace/);
  assert.match(workspace, /DESIGN_CANVAS_SURFACES/);
  assert.match(workspace, /data-panel-layout="visual-storefront-canvas"/);
  assert.match(workspace, /DesignSettingsDrawer/);
  assert.match(stepEditor, /StarterThemeComposer/);
  assert.match(page, /resolveDesignWorkspaceLocation/);
  assert.match(inspector, /Görsel yükle/);
  assert.match(preview, /VisualStorefrontCanvas/);
  assert.match(canvas, /StorefrontDesignRenderer/);
  assert.match(drawer, /role="dialog"/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /:focus/);
  assert.doesNotMatch(`${page}\n${workspace}\n${stepEditor}\n${inspector}\n${preview}\n${canvas}\n${drawer}`, /iframe|localStorage|sessionStorage|storeId=|x-store-id|tenantContext=|dangerouslySetInnerHTML|provider|credential/i);
});

test("legacy starter theme editors converge on the unified design workspace", async () => {
  for (const path of [
    "app/settings/theme/page.tsx",
    "app/settings/category-showcase/page.tsx",
  ]) {
    const page = await source(path);
    assert.match(page, /requireServerPanelAccess\(\)/);
    assert.match(page, /redirect\("\/settings\/design\?section=theme"\)/);
    assert.doesNotMatch(page, /StarterThemeComposer|CategoryShowcaseEditor/);
  }
});
