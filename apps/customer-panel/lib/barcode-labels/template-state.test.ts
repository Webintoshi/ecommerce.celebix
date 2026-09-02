import assert from "node:assert/strict";
import test from "node:test";
import type { BarcodeLabelTemplate } from "@celebix/saas-contracts";
import { getSystemBarcodeLabelTemplate } from "./system-templates.ts";
import { reconcileActiveTemplateMutation } from "./template-state.ts";

const config = getSystemBarcodeLabelTemplate("retail-50x30")!.config;
const active = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Etiket",
  config,
  status: "active",
  isDefault: false,
  version: 1,
  createdAt: "2026-09-02T12:00:00.000Z",
  updatedAt: "2026-09-02T12:00:00.000Z",
} as BarcodeLabelTemplate;

test("active template lifecycle adopts the returned version and detaches archive snapshots", () => {
  const renamed = { ...active, name: "Yeni Etiket", version: 2 } as BarcodeLabelTemplate;
  const updated = reconcileActiveTemplateMutation(
    { active, detached: false, name: active.name, config },
    active.id,
    "rename",
    renamed,
  );
  assert.equal(updated.active?.version, 2);
  assert.equal(updated.name, "Yeni Etiket");
  const archived = {
    ...renamed,
    status: "archived",
    version: 3,
  } as BarcodeLabelTemplate;
  const localDraft = {
    ...config,
    barcodeHeightMm: config.barcodeHeightMm + 1,
  };
  const detached = reconcileActiveTemplateMutation(
    { ...updated, config: localDraft },
    active.id,
    "archive",
    archived,
  );
  assert.equal(detached.active, undefined);
  assert.equal(detached.detached, true);
  assert.equal(detached.config, localDraft);
});

test("making another template default adopts the server-side version bump of the active default", () => {
  const defaultActive = { ...active, isDefault: true } as BarcodeLabelTemplate;
  const other = {
    ...active,
    id: "10000000-0000-4000-8000-000000000002",
    name: "Başka Etiket",
    isDefault: true,
    version: 4,
    updatedAt: "2026-09-02T13:00:00.000Z",
  } as BarcodeLabelTemplate;
  const reconciled = reconcileActiveTemplateMutation(
    {
      active: defaultActive,
      detached: false,
      name: defaultActive.name,
      config,
    },
    other.id,
    "default",
    other,
  );
  assert.equal(reconciled.active?.id, defaultActive.id);
  assert.equal(reconciled.active?.version, 2);
  assert.equal(reconciled.active?.isDefault, false);
  assert.equal(reconciled.active?.updatedAt, other.updatedAt);
  assert.equal(reconciled.config, config);
});
