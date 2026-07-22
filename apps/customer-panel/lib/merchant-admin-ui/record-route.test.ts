import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getMerchantModuleDefinition } from "./presentation.ts";
import { getMerchantRecordRouteDefinition } from "./record-route.ts";

test("locks each editor route to one merchant record kind", () => {
  assert.equal(getMerchantRecordRouteDefinition("content-blog").kind, "blog_post");
  assert.equal(getMerchantRecordRouteDefinition("payment").kind, "payment_setting");
  assert.throws(
    () => getMerchantRecordRouteDefinition("marketplace_connection"),
    /merchant_record_route_invalid/,
  );
});

test("payment editor never accepts provider credentials", () => {
  const fields = getMerchantModuleDefinition("payment_setting").fields.map(({ key }) => key);
  assert.deepEqual(fields, ["enabledMethods", "cashOnDelivery"]);
  for (const key of fields) {
    assert.doesNotMatch(key, /secret|password|credential|token|api.?key/i);
  }
});

test("record editor selects an exact persisted kind and uses its returned version", async () => {
  const source = await readFile(
    new URL("../../components/merchant-admin/MerchantRecordEditor.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /record[.]kind\s*!==\s*kind/);
  assert.match(source, /expectedVersion:\s*record[.]version/);
  assert.match(source, /requestSequence[.]current\s*!==\s*sequence/);
});

test("policy type remains read-only and approved route links are canonical", async () => {
  const source = await readFile(
    new URL("../../components/merchant-admin/MerchantRecordEditor.tsx", import.meta.url),
    "utf8",
  );
  const consoleSource = await readFile(
    new URL("../../components/merchant-admin/MerchantModuleConsole.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /field[.]key\s*===\s*["']policyType["']\s*&&\s*record/);
  assert.match(source, /readOnly/);
  assert.match(source, /config\[field[.]key\]\s*=\s*record[.]config\[field[.]key\]/);
  assert.match(consoleSource, /createRouteFor\(definition[.]kind\)/);
  assert.match(consoleSource, /editRouteFor\(definition[.]kind,\s*record[.]id\)/);
  assert.doesNotMatch(consoleSource, /`\/${definition[.]route}/);
});
