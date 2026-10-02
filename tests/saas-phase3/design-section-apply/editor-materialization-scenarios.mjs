import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const STEM = "202610020199_storefront_design_editor_materialization";

// This fixture is called only by the existing ephemeral, socket-only PG harness.
// The counter stays outside merchant data and never appears in either payload.
export function runEditorMaterializationScenarios(c) {
  const { box, DB, SQL, STORE, json, scalar, owner, apply, psql, scenario } = c;
  assert.match(DB, /^design_section_[0-9a-f]+$/);
  assert.match(box.socket, /cx-design-section-/);
  const signature = "saas.storefront_design_editor_payload(uuid)";
  const metadata = () => json(box, `SELECT to_jsonb(p) FROM pg_catalog.pg_proc p WHERE oid='${signature}'::regprocedure;`);
  const payload = () => json(box, `SELECT saas.storefront_design_editor_payload('${STORE}');`);
  const merchantData = () => json(box, `SELECT jsonb_build_object(
    'designs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.store_id) FROM saas.storefront_designs r),
    'media',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.storefront_design_media r),
    'assets',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.storefront_assets r),
    'operations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.operation_id) FROM saas.storefront_design_operations r),
    'events',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.storefront_design_events r));`);
  const originalMetadata = metadata(), originalData = merchantData();
  const calls = () => Number(scalar(box, "SELECT last_value FROM saas.editor_workspace_calls;"));
  const reset = () => owner(box, "ALTER SEQUENCE saas.editor_workspace_calls RESTART WITH 1");
  owner(box, `ALTER FUNCTION saas.storefront_design_workspace_payload(uuid) RENAME TO editor_workspace_uncounted;
    CREATE SEQUENCE saas.editor_workspace_calls;
    CREATE FUNCTION saas.storefront_design_workspace_payload(p_store_id uuid)
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $counter$
    BEGIN
      PERFORM pg_catalog.nextval('saas.editor_workspace_calls');
      RETURN saas.editor_workspace_uncounted(p_store_id);
    END $counter$;
    REVOKE ALL ON FUNCTION saas.storefront_design_workspace_payload(uuid) FROM PUBLIC;`);
  try {
    reset();
    const original = payload(), repeatedCalls = calls();
    scenario("199 baseline reproduces repeated workspace calls with real nonempty catalog and images", () => {
      assert.ok(repeatedCalls > 1, `baseline must reproduce repeated calls; observed ${repeatedCalls}`);
      assert.ok(original.destinations.length > 0);
      assert.ok(original.destinations.some(item => item.kind === "product" && item.searchTerms.length > 0));
      assert.ok(original.media.some(item => item.reference.kind === "media"));
      assert.ok(original.media.some(item => item.reference.kind === "asset"));
    });
    apply(box, `${STEM}.up.sql`);
    apply(box, `${STEM}_assertions.sql`);
    reset();
    const optimized = payload(), optimizedCalls = calls();
    scenario("199 computes workspace once and preserves the complete original editor payload", () => {
      assert.equal(optimizedCalls, 1);
      assert.deepEqual(optimized, original);
      const { prosrc: oldSource, ...beforeAuthority } = originalMetadata;
      const { prosrc: newSource, ...afterAuthority } = metadata();
      assert.notEqual(newSource, oldSource);
      assert.deepEqual(afterAuthority, beforeAuthority);
      assert.deepEqual(merchantData(), originalData);
    });
    apply(box, `${STEM}.down.sql`);
    reset();
    scenario("199 rollback restores the exact function and payload without merchant writes", () => {
      assert.deepEqual(metadata(), originalMetadata);
      assert.deepEqual(payload(), original);
      assert.equal(calls(), repeatedCalls);
      assert.deepEqual(merchantData(), originalData);
    });
    apply(box, `${STEM}.up.sql`);
    scenario("199 refuses repeat apply instead of overwriting an unreviewed source", () => {
      const before = metadata();
      const result = psql(box, readFileSync(path.join(SQL, `${STEM}.up.sql`), "utf8"), DB, true);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /DESIGN_EDITOR_MATERIALIZATION_UP_PRECONDITION_FAILED/);
      assert.deepEqual(metadata(), before);
    });
  } finally {
    owner(box, `DROP FUNCTION saas.storefront_design_workspace_payload(uuid);
      ALTER FUNCTION saas.editor_workspace_uncounted(uuid) RENAME TO storefront_design_workspace_payload;
      DROP SEQUENCE saas.editor_workspace_calls;`);
  }
}
