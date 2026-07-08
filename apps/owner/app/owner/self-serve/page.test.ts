import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const detailPageSource = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
const listPanelSource = readFileSync(
  new URL("../../../components/self-serve/SelfServeOwnerRequestsPanel.tsx", import.meta.url),
  "utf8",
);
const detailPanelSource = readFileSync(
  new URL("../../../components/self-serve/SelfServeOwnerRequestDetail.tsx", import.meta.url),
  "utf8",
);

const monitorSource = [listPageSource, detailPageSource, listPanelSource, detailPanelSource].join("\n");

test("super admin self-serve surface is a monitoring view, not a normal approval inbox", () => {
  assert.match(monitorSource, /Self-serve Mağaza Monitörü/);
  assert.match(monitorSource, /otomatik mağaza kayıtlarını/);
  assert.match(monitorSource, /Paket/);
  assert.match(monitorSource, /Provisioning/);

  assert.doesNotMatch(monitorSource, /Basvuru/i);
  assert.doesNotMatch(monitorSource, /Başvuru/i);
  assert.doesNotMatch(monitorSource, /Onay/i);
  assert.doesNotMatch(monitorSource, /Red/i);
  assert.doesNotMatch(monitorSource, /Reddet/i);
  assert.doesNotMatch(monitorSource, /owner approval/i);
  assert.doesNotMatch(monitorSource, /approval inbox/i);
});
