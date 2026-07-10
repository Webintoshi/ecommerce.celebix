import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeRestorePlan,
  parseCatalog,
  renderMarkdown,
  writeAnalysisOutputs,
} from "./supabase-restore-plan-analyzer.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = path.join(
  scriptDirectory,
  "fixtures",
  "supabase-restore-plan",
);

async function fixture(name) {
  return readFile(path.join(fixturesDirectory, name), "utf8");
}

async function analyze(inventoryName = "synthetic-inventory.json") {
  return analyzeRestorePlan({
    catalogText: await fixture("synthetic-catalog.list"),
    inventoryText: await fixture(inventoryName),
  });
}

async function syntheticInventory() {
  return JSON.parse(await fixture("synthetic-inventory.json"));
}

async function analyzeInventory(inventory) {
  return analyzeRestorePlan({
    catalogText: await fixture("synthetic-catalog.list"),
    inventoryText: JSON.stringify(inventory, null, 2),
  });
}

test("classifies all exact bootstrap and extension candidates together", async () => {
  const report = await analyze();
  const classifications = report.entries.map((entry) => [
    entry.archiveItemId,
    entry.classification,
  ]);

  assert.equal(report.status, "review_required");
  assert.equal(report.executablePlanEmitted, false);
  assert.deepEqual(classifications, [
    ["101", "restore"],
    ["102", "exact_bootstrap_duplicate_candidate"],
    ["103", "exact_bootstrap_duplicate_candidate"],
    ["104", "extension_managed_candidate"],
    ["105", "extension_managed_candidate"],
    ["106", "restore"],
    ["107", "restore"],
  ]);
  assert.deepEqual(report.summary, {
    exact_bootstrap_duplicate_candidate: 2,
    extension_managed_candidate: 2,
    restore: 3,
    unknown_conflict: 0,
  });
  assert.deepEqual(report.versionCompatibility.checks, {
    postgresMajor: true,
    postgresVersion: true,
    supabaseImage: true,
    supabaseImageDigest: true,
  });
  assert.equal(report.entries[1].archiveOwner, "fixture_owner");
  assert.equal(report.entries[1].targetOwner, "bootstrap_target_owner");
  assert.deepEqual(report.entries[3].sourceExtension, {
    name: "synthetic_secrets_extension",
    version: "1.2.3-synthetic",
    membershipVerified: true,
    membershipEvidenceSha256:
      "sha256:7777777777777777777777777777777777777777777777777777777777777777",
  });
});

test("rejects candidate and target records with missing exact owner evidence", async () => {
  const missingTargetOwner = await syntheticInventory();
  delete missingTargetOwner.targetObjects[0].owner;
  await assert.rejects(
    analyzeInventory(missingTargetOwner),
    /owner evidence/i,
  );

  const missingArchiveOwner = await syntheticInventory();
  delete missingArchiveOwner.reviewedCandidates[0].archiveOwner;
  await assert.rejects(
    analyzeInventory(missingArchiveOwner),
    /owner evidence/i,
  );
});

test("blocks exact candidate classification on source or target owner mismatch", async () => {
  const archiveOwnerMismatch = await syntheticInventory();
  archiveOwnerMismatch.reviewedCandidates[0].archiveOwner = "unexpected_fixture_owner";
  const sourceReport = await analyzeInventory(archiveOwnerMismatch);
  assert.equal(sourceReport.status, "blocked");
  assert.equal(
    sourceReport.entries[1].reasonCode,
    "REVIEWED_CANDIDATE_OWNER_MISMATCH",
  );

  const targetOwnerMismatch = await syntheticInventory();
  targetOwnerMismatch.reviewedCandidates[0].expectedTargetOwner =
    "unexpected_target_owner";
  const targetReport = await analyzeInventory(targetOwnerMismatch);
  assert.equal(targetReport.status, "blocked");
  assert.equal(
    targetReport.entries[1].reasonCode,
    "REVIEWED_CANDIDATE_OWNER_MISMATCH",
  );
});

test("requires verified source and target extension-membership evidence", async () => {
  const missingSourceEvidence = await syntheticInventory();
  delete missingSourceEvidence.reviewedCandidates[2].sourceExtension;
  await assert.rejects(
    analyzeInventory(missingSourceEvidence),
    /source extension evidence/i,
  );

  const unverifiedTargetMembership = await syntheticInventory();
  unverifiedTargetMembership.targetObjects[2].extension.membershipVerified = false;
  await assert.rejects(
    analyzeInventory(unverifiedTargetMembership),
    /membership.*verified/i,
  );
});

test("blocks extension candidate classification on extension version mismatch", async () => {
  const inventory = await syntheticInventory();
  inventory.reviewedCandidates[2].sourceExtension.version = "9.9.9-synthetic";

  const report = await analyzeInventory(inventory);

  assert.equal(report.status, "blocked");
  assert.equal(
    report.entries[3].reasonCode,
    "REVIEWED_EXTENSION_EVIDENCE_MISMATCH",
  );
});

test("requires exact PostgreSQL version, image tag, and image digest matching", async () => {
  const postgresMismatch = await syntheticInventory();
  postgresMismatch.targetVersion.postgresVersion = "15.9";
  const postgresReport = await analyzeInventory(postgresMismatch);
  assert.equal(postgresReport.status, "blocked");
  assert.equal(postgresReport.versionCompatibility.checks.postgresVersion, false);

  const digestMismatch = await syntheticInventory();
  digestMismatch.targetVersion.supabaseImageDigest =
    "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  const digestReport = await analyzeInventory(digestMismatch);
  assert.equal(digestReport.status, "blocked");
  assert.equal(digestReport.versionCompatibility.checks.supabaseImageDigest, false);
});

test("blocks on an unknown duplicate instead of auto-excluding it", async () => {
  const report = await analyze("unknown-conflict-inventory.json");
  const entry = report.entries.find(({ archiveItemId }) => archiveItemId === "101");

  assert.equal(report.status, "blocked");
  assert.equal(report.executablePlanEmitted, false);
  assert.equal(entry.classification, "unknown_conflict");
  assert.equal(entry.reasonCode, "TARGET_OBJECT_NOT_EXACTLY_REVIEWED");
});

test("never auto-excludes an application-owned collision", async () => {
  const report = await analyze("application-owned-conflict-inventory.json");
  const entry = report.entries.find(({ archiveItemId }) => archiveItemId === "106");

  assert.equal(report.status, "blocked");
  assert.equal(entry.classification, "unknown_conflict");
  assert.equal(entry.targetManagement, "application");
});

test("rejects wildcard and schema-wide candidate syntax", async () => {
  await assert.rejects(
    analyze("wildcard-inventory.json"),
    /wildcard|schema-wide/i,
  );
  await assert.rejects(
    analyze("schema-wide-inventory.json"),
    /wildcard|schema-wide/i,
  );
});

test("rejects a catalog entry without an exact archive item ID", async () => {
  const catalogText = await fixture("missing-id-catalog.list");

  assert.throws(
    () => parseCatalog(catalogText),
    /exact archive item ID/i,
  );
});

test("blocks a source and target version mismatch", async () => {
  const report = await analyze("version-mismatch-inventory.json");

  assert.equal(report.status, "blocked");
  assert.equal(report.versionCompatibility.compatible, false);
  assert.equal(report.globalConflicts[0].reasonCode, "SOURCE_TARGET_VERSION_MISMATCH");
});

test("blocks a reviewed candidate when target inventory fingerprint differs", async () => {
  const report = await analyze("inventory-fingerprint-mismatch.json");
  const entry = report.entries.find(({ archiveItemId }) => archiveItemId === "102");

  assert.equal(report.status, "blocked");
  assert.equal(entry.classification, "unknown_conflict");
  assert.equal(
    entry.reasonCode,
    "REVIEWED_CANDIDATE_IDENTITY_OR_FINGERPRINT_MISMATCH",
  );
});

test("ordering, JSON hashes, and Markdown are deterministic", async () => {
  const first = await analyze();
  const second = await analyze();
  const markdown = renderMarkdown(first);

  assert.deepEqual(first, second);
  assert.match(first.hashes.catalogSha256, /^[a-f0-9]{64}$/);
  assert.match(first.hashes.inventorySha256, /^[a-f0-9]{64}$/);
  assert.match(first.hashes.inputsSha256, /^[a-f0-9]{64}$/);
  assert.match(first.hashes.proposedPlanSha256, /^[a-f0-9]{64}$/);
  assert.equal(markdown, renderMarkdown(second));
  assert.match(markdown, /synthetic_secrets_extension@1\.2\.3-synthetic/);
  assert.match(
    markdown,
    /sha256:7777777777777777777777777777777777777777777777777777777777777777/,
  );
  assert.match(
    markdown,
    /sha256:5555555555555555555555555555555555555555555555555555555555555555/,
  );
});

test("writes advisory JSON and Markdown without an executable restore command", async () => {
  const outputDirectory = await mkdtemp(
    path.join(tmpdir(), "supabase-restore-plan-analyzer-"),
  );
  const jsonPath = path.join(outputDirectory, "plan.json");
  const markdownPath = path.join(outputDirectory, "plan.md");
  const report = await analyze();

  await writeAnalysisOutputs({ report, jsonPath, markdownPath });

  const [json, markdown, jsonStat, markdownStat] = await Promise.all([
    readFile(jsonPath, "utf8"),
    readFile(markdownPath, "utf8"),
    stat(jsonPath),
    stat(markdownPath),
  ]);
  assert.ok(jsonStat.size > 0);
  assert.ok(markdownStat.size > 0);
  assert.match(json, /NOT APPROVED FOR RESTORE EXECUTION/);
  assert.match(markdown, /NOT APPROVED FOR RESTORE EXECUTION/);
  assert.doesNotMatch(`${json}\n${markdown}`, /(?:pg_restore|psql)\s+--?/i);
});

test("implementation has no shell, restore-process, or network capability", async () => {
  const source = await readFile(
    path.join(scriptDirectory, "supabase-restore-plan-analyzer.mjs"),
    "utf8",
  );

  assert.doesNotMatch(source, /node:(?:child_process|net|tls|http|https)/);
  assert.doesNotMatch(source, /\b(?:exec|execFile|spawn|fork|fetch)\s*\(/);
  assert.doesNotMatch(source, /\b(?:pg_restore|psql)\b\s+[^\n]*--/i);
});
