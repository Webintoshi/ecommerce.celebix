import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("design settings hub is server-authorized and links only persisted design surfaces", async () => {
  const page = await source("app/settings/design/page.tsx");
  const hub = await source("components/settings/DesignSettingsHub.tsx");
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /configuration[.]manage/);
  for (const href of ["/settings/hero-banner", "/settings/promotion-banner", "/settings/marquee", "/products/collections"]) assert.match(hub, new RegExp(`"${href}"`));
  const css = await source("components/settings/design-settings.module.css");
  assert.match(hub, /styles[.]surface/);
  assert.match(hub, /styles[.]card/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(`${page}\n${hub}`, /theme editor|localStorage|sessionStorage|storeId|provider|credential/i);
});
