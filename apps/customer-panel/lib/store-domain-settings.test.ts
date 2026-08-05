import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("settings domain route is tenant-authorized and uses the live domain client", async () => {
  const [page, component, css, navigation, overview] = await Promise.all([
    source("app/settings/domains/page.tsx"),
    source("components/settings/domains/StoreDomainSettings.tsx"),
    source("components/settings/domains/store-domain-settings.module.css"),
    source("lib/panel-ui/navigation.ts"),
    source("components/merchant-admin/MerchantFamilyOverview.tsx"),
  ]);
  assert.match(page, /requireServerPanelAccess/u);
  assert.match(page, /configuration\.manage/u);
  assert.match(component, /storeDomainApi\.list/u);
  assert.match(component, /storeDomainApi\.create/u);
  assert.match(component, /storeDomainApi\.recheck/u);
  assert.match(component, /storeDomainApi\.makePrimary/u);
  assert.match(component, /storeDomainApi\.remove/u);
  assert.match(component, /navigator\.clipboard\.writeText/u);
  assert.match(component, /PanelTopbarBridge title="Alan Adı"/u);
  assert.match(css, /@media \(max-width: 720px\)/u);
  assert.doesNotMatch(css, /box-shadow/u);
  assert.match(navigation, /"\/settings\/domains"/u);
  assert.match(overview, /href: "\/settings\/domains"/u);
});
