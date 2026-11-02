import assert from "node:assert/strict";
import test from "node:test";
import type { MerchantAdminRecord } from "@celebix/saas-contracts";
import { partitionContentPages } from "./policy-associations.ts";
import { buildMerchantModuleSummary } from "../merchant-admin-ui/presentation.ts";

const page = (id: string, name: string, version = 1): MerchantAdminRecord => ({ id, kind: "page", name, config: { published: true }, status: "active", version, createdAt: "2026-11-02T12:00:00.000Z", updatedAt: "2026-11-02T12:00:00.000Z" });

test("associated policies are separate from normal page counts and remain searchable", () => {
  const records = [page("one", "Hakkımızda"), page("two", "Gizlilik"), page("three", "KVKK")];
  const result = partitionContentPages(records, [{ recordId: "two", recordVersion: 1, policyKey: "privacy_security" }, { recordId: "three", recordVersion: 1, policyKey: "kvkk" }]);
  assert.deepEqual(result.pages.map(({ id }) => id), ["one"]);
  assert.deepEqual(result.policyPages.map(({ record, policyKey }) => [record.id, policyKey]), [["two", "privacy_security"], ["three", "kvkk"]]);
  assert.equal(buildMerchantModuleSummary(result.pages, "", "all").total, 1);
  assert.equal(buildMerchantModuleSummary(result.pages, "KVKK", "all").visible.length, 0);
  assert.equal(buildMerchantModuleSummary(result.policyPages.map(({ record }) => record), "KVKK", "all").visible.length, 1);
  assert.equal(records.length, 3);
});

test("new versions, required pages, other kinds and missing associations remain visible normally", () => {
  const records = [page("one", "Gizlilik", 2), { ...page("two", "Hakkımızda"), requiredPageKey: "about" as const }, { ...page("three", "Yazı"), kind: "blog_post" as const }];
  const associations = records.map(({ id }) => ({ recordId: id, recordVersion: 1, policyKey: "privacy_security" as const }));
  assert.deepEqual(partitionContentPages(records, associations).pages, records);
  assert.deepEqual(partitionContentPages(records, []).pages, records);
});
