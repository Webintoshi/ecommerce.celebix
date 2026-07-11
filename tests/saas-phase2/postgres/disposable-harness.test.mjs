import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as harness from "./disposable-harness.mjs";

const {
  DISPOSABLE_IMAGE,
  REQUIRED_NATIVE_TOOLS,
  REQUIRED_APPLY_ORDER,
  assertLocalEngineEndpoint,
  assertSafeEnvironment,
  createRunNames,
  normalizeSchemaDump,
  selectExecutionBackend,
  validatePinnedImage,
} = harness;

test("pins a PostgreSQL major while leaving production distribution open", () => {
  assert.equal(DISPOSABLE_IMAGE, "postgres:16-alpine");
  assert.doesNotThrow(() => validatePinnedImage(DISPOSABLE_IMAGE));
  for (const unsafe of ["postgres", "postgres:latest", "supabase/postgres:16", "postgresql://host/db"]) {
    assert.throws(() => validatePinnedImage(unsafe), /pinned official PostgreSQL major/i, unsafe);
  }
});

test("selects Docker, Podman, or a complete isolated native PostgreSQL toolchain", () => {
  assert.equal(typeof selectExecutionBackend, "function");
  assert.ok(Array.isArray(REQUIRED_NATIVE_TOOLS));
  assert.deepEqual(
    selectExecutionBackend((name) => (name === "docker" ? "/bin/docker" : null)),
    { kind: "container", engine: "docker", executable: "/bin/docker" },
  );
  assert.deepEqual(
    selectExecutionBackend((name) => (name === "podman" ? "/bin/podman" : null)),
    { kind: "container", engine: "podman", executable: "/bin/podman" },
  );
  assert.deepEqual(
    selectExecutionBackend((name) => (REQUIRED_NATIVE_TOOLS.includes(name) ? `/native/bin/${name}` : null)),
    {
      kind: "native",
      executables: Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, `/native/bin/${name}`])),
    },
  );
  assert.equal(selectExecutionBackend((name) => (name === "psql" ? "/bin/psql" : null)), null);
  assert.equal(selectExecutionBackend(() => null), null);
});

test("refuses every ambient database or infrastructure credential", () => {
  assert.doesNotThrow(() => assertSafeEnvironment({ PATH: "/usr/bin" }));
  for (const key of [
    "DATABASE_URL",
    "POSTGRES_URL",
    "PGHOST",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD",
    "SUPABASE_URL",
    "SUPABASE_DB_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OWNER_SUPABASE_SERVICE_ROLE_KEY",
    "DOCKER_HOST",
    "CONTAINER_HOST",
  ]) {
    assert.throws(
      () => assertSafeEnvironment({ PATH: "/usr/bin", [key]: "non-disposable-value" }),
      new RegExp(`${key}.*refused`, "i"),
      key,
    );
  }
});

test("accepts only local container-engine endpoints", () => {
  for (const endpoint of [
    "unix:///var/run/docker.sock",
    "npipe:////./pipe/docker_engine",
    "ssh://localhost/run/user/1000/podman/podman.sock",
    "ssh://developer@127.0.0.1:2222/run/podman.sock",
    "ssh://[::1]/run/podman.sock",
  ]) {
    assert.equal(assertLocalEngineEndpoint(endpoint), endpoint);
  }
  for (const endpoint of [
    "tcp://127.0.0.1:2375",
    "ssh://build-host.example.test/run/podman.sock",
    "https://docker.example.test",
    "",
  ]) {
    assert.throws(() => assertLocalEngineEndpoint(endpoint), /remote container-engine endpoint is refused/i);
  }
});

test("creates unique container-only resource names without external hostnames", () => {
  const first = createRunNames("0011223344556677");
  const second = createRunNames("8899aabbccddeeff");
  assert.notEqual(first.container, second.container);
  assert.match(first.container, /^celebix-phase2a1-[a-f0-9]{16}$/);
  assert.match(first.network, /^celebix-phase2a1-net-[a-f0-9]{16}$/);
  assert.equal(first.primaryDatabase, "phase2a1_primary");
  assert.equal(first.restoreDatabase, "phase2a1_restore");
  assert.equal(first.rollbackDatabase, "phase2a1_rollback");
  assert.ok(Object.values(first).every((value) => !value.includes(".")));
});

test("normalizes only nondeterministic pg_dump headers and whitespace", () => {
  const left = `\\restrict FirstRandomToken\n-- Dumped from database version 16.4\n-- Dumped by pg_dump version 16.4\n\nSET statement_timeout = 0;\nCREATE TABLE saas.example (\n id uuid\n);\n\\unrestrict FirstRandomToken\n`;
  const right = `\\restrict SecondRandomToken\n-- Dumped from database version 16.9\n-- Dumped by pg_dump version 16.9\nSET statement_timeout = 0;\n\nCREATE TABLE saas.example (\n id uuid\n);\n\\unrestrict SecondRandomToken\n`;
  assert.equal(normalizeSchemaDump(left), normalizeSchemaDump(right));
  assert.notEqual(normalizeSchemaDump(left), normalizeSchemaDump(left.replace("uuid", "text")));
});

test("apply order keeps role creation, schema, seed, grants, and assertions explicit", () => {
  assert.deepEqual(REQUIRED_APPLY_ORDER, [
    "202607110001_roles.up.sql",
    "202607110002_foundation.up.sql",
    "202607110003_free_starter.seed.sql",
    "202607110003_plan_versions.freeze.sql",
    "202607110004_grants.sql",
    "202607110005_catalog_assertions.sql",
  ]);
});

test("harness covers the complete disposable evidence lifecycle", () => {
  const source = readFileSync(new URL("./disposable-harness.mjs", import.meta.url), "utf8");
  for (const required of [
    "image digest",
    "manifest checksums",
    "forward migration",
    "constraint tests",
    "application principal mutation denial",
    "snapshot store drift",
    "snapshot canonical domain drift",
    "snapshot membership authority drift",
    "snapshot membership timestamp drift",
    "snapshot subscription status drift",
    "snapshot subscription validity drift",
    "snapshot plan identity drift",
    "snapshot feature order drift",
    "snapshot effective limits drift",
    "snapshot storefront hostname drift",
    "role privilege tests",
    "RLS isolation tests",
    "exact-host resolver tests",
    "same key same fingerprint",
    "same key different fingerprint",
    "loser separate select",
    "committed graph references",
    "slug race",
    "hostname race",
    "principal authority race",
    "owner membership race",
    "free_starter seed race",
    "pool context reset",
    "schema-only dump",
    "backup",
    "restore",
    "restored RLS and privileges",
    "rollback",
    "reapply",
    "normalized schema comparison",
    "cleanup proof",
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), required);
  }
  assert.match(source, /network\s+create/i);
  assert.match(source, /run[^\n]+--network/is);
  assert.doesNotMatch(source, /(?:-p|--publish)\s+\d/i);
  assert.match(source, /pg_isready/i);
  assert.match(source, /DISPOSABLE_DB_EXECUTION_BLOCKED/);
  assert.match(source, /initdb/i);
  assert.match(source, /pg_ctl/i);
  assert.match(source, /native PostgreSQL/i);
  assert.match(source, /SET SESSION AUTHORIZATION celebix_saas_migrator/);
  assert.doesNotMatch(source, /SET ROLE celebix_saas_migrator/);
  assert.match(source, /process\.once\("SIGINT"/);
  assert.match(source, /process\.once\("SIGTERM"/);
  assert.match(source, /process\.once\("exit"/);
  assert.match(source, /cleanupOnce/);
});
