import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("design settings hub is server-authorized and links only persisted design surfaces", async () => {
  const page = await source("app/settings/design/page.tsx");
  const hub = await source("components/settings/DesignSettingsHub.tsx");
  const preview = await source("components/settings/StarterThemePreview.tsx");
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /configuration[.]manage/);
  assert.match(page, /resolveDefaultServerPanelAccessRuntime/);
  assert.match(page, /resolveServerMerchantAdminRuntime/);
  assert.match(page, /getEffectiveStarterPresentation/);
  assert.doesNotMatch(page, /buildDefaultStarterPresentation/);
  assert.match(page, /canonicalHostname/);
  for (const href of ["/settings/theme", "/settings/general", "/settings/hero-banner", "/settings/category-showcase", "/settings/promotion-banner", "/settings/marquee", "/seo", "/seo/social-preview", "/products/collections"]) assert.match(hub, new RegExp(`"${href}"`));
  assert.match(hub, /CategoryShowcaseEditor/);
  const css = await source("components/settings/design-settings.module.css");
  assert.match(hub, /styles[.]surface/);
  assert.match(hub, /styles[.]card/);
  assert.match(hub, /aria-disabled/);
  assert.match(preview, /aria-pressed/);
  assert.match(preview, /starterThemeTokens/);
  assert.match(preview, /starterMarqueeTokens/);
  assert.match(preview, /Örnek içerik/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /--preview-accent-ink:\s*#17120e/);
  assert.match(css, /color:\s*var\(--preview-accent-ink\)/);
  assert.match(css, /animation-duration:\s*[.]01ms/);
  assert.doesNotMatch(`${page}\n${hub}\n${preview}`, /localStorage|sessionStorage|principalId|membershipId|provider|credential|fake KPI|alışveriş sepeti/i);
});
