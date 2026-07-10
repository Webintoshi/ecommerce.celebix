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

function reasonCodes(report) {
  return report.globalConflicts.map((conflict) => conflict.reasonCode);
}

function reverseObjectProperties(value) {
  if (Array.isArray(value)) {
    return value.map(reverseObjectProperties);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reverseObjectProperties(child)]),
    );
  }
  return value;
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
    supabaseImageName: true,
    supabaseImageTag: true,
    supabaseImageDigest: true,
  });
  assert.equal(report.entries[1].archiveOwner, "fixture_owner");
  assert.equal(report.entries[1].targetOwner, "bootstrap_target_owner");
  assert.deepEqual(report.entries[3].sourceExtension, {
    name: "synthetic_secrets_extension",
    version: "1.2.3-synthetic",
    membershipVerified: true,
    membershipEvidenceType: "synthetic_pg_depend_snapshot",
    membershipEvidenceSha256:
      "sha256:5555555555555555555555555555555555555555555555555555555555555555",
  });
});

test("surfaces all malformed evidence with deterministic machine reason codes", async () => {
  const inventory = await syntheticInventory();
  delete inventory.targetInventoryEvidence;
  delete inventory.targetObjects[0].owner;
  delete inventory.reviewedCandidates[0].archiveOwner;
  delete inventory.reviewedCandidates[2].sourceExtension.name;
  delete inventory.reviewedCandidates[2].sourceExtension.membershipEvidenceType;
  inventory.targetObjects[2].extension.membershipVerified = false;

  const report = await analyzeInventory(inventory);

  assert.equal(report.status, "blocked");
  assert.equal(report.executablePlanEmitted, false);
  assert.equal(report.advisory, "NOT APPROVED FOR RESTORE EXECUTION");
  assert.deepEqual(reasonCodes(report), [
    "TARGET_INVENTORY_EVIDENCE_MISSING",
    "TARGET_OBJECT_OWNER_MISSING",
    "CANDIDATE_ARCHIVE_OWNER_MISSING",
    "SOURCE_EXTENSION_NAME_MISSING",
    "SOURCE_EXTENSION_MEMBERSHIP_TYPE_MISSING",
    "TARGET_EXTENSION_MEMBERSHIP_UNVERIFIED",
  ]);
  assert.ok(report.globalConflicts.every((conflict) => conflict.message));
});

test("reports distinct image name, tag, and digest mismatch reason codes", async () => {
  const nameMismatch = await syntheticInventory();
  nameMismatch.targetVersion.supabaseImage =
    "synthetic-registry/postgres:15.8.1.synthetic";
  const nameMismatchReport = await analyzeInventory(nameMismatch);
  assert.deepEqual(
    reasonCodes(nameMismatchReport),
    ["DISTRIBUTION_IMAGE_NAME_MISMATCH"],
  );
  assert.equal(
    nameMismatchReport.entries.find(({ archiveItemId }) => archiveItemId === "102")
      .reasonCode,
    "PLATFORM_COMPATIBILITY_BLOCKED",
  );

  const tagMismatch = await syntheticInventory();
  tagMismatch.targetVersion.supabaseImage =
    "supabase/postgres:15.8.2.synthetic";
  assert.deepEqual(
    reasonCodes(await analyzeInventory(tagMismatch)),
    ["DISTRIBUTION_IMAGE_TAG_MISMATCH"],
  );

  const digestMismatch = await syntheticInventory();
  digestMismatch.targetVersion.supabaseImageDigest =
    "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  assert.deepEqual(
    reasonCodes(await analyzeInventory(digestMismatch)),
    ["DISTRIBUTION_IMAGE_DIGEST_MISMATCH"],
  );
});

test("fails closed on incomplete platform, floating image, inventory, and format evidence", async () => {
  const inventory = await syntheticInventory();
  delete inventory.sourceVersion.postgresVersion;
  inventory.sourceVersion.supabaseImage = "supabase/postgres:latest";
  delete inventory.targetVersion.supabaseImage;
  delete inventory.targetVersion.supabaseImageDigest;
  delete inventory.targetInventoryEvidence.version;
  delete inventory.targetInventoryEvidence.sha256;
  inventory.formatVersion = 3;

  const report = await analyzeInventory(inventory);

  assert.equal(report.status, "blocked");
  assert.deepEqual(reasonCodes(report), [
    "INVENTORY_FORMAT_UNSUPPORTED",
    "SOURCE_POSTGRES_VERSION_INVALID",
    "SOURCE_IMAGE_TAG_FLOATING",
    "TARGET_IMAGE_EVIDENCE_MISSING",
    "TARGET_IMAGE_DIGEST_INVALID",
    "TARGET_INVENTORY_VERSION_MISSING",
    "TARGET_INVENTORY_HASH_INVALID",
  ]);
});

test("requires exact non-generic extension identity and complete membership evidence", async () => {
  const inventory = await syntheticInventory();
  const source = inventory.reviewedCandidates[2].sourceExtension;
  const target = inventory.targetObjects[2].extension;
  source.name = "extension";
  delete source.version;
  source.membershipVerified = false;
  source.membershipEvidenceType = "managed";
  delete source.membershipEvidenceSha256;
  delete target.name;
  delete target.version;
  target.membershipVerified = false;
  delete target.membershipEvidenceType;
  delete target.membershipEvidenceSha256;

  const report = await analyzeInventory(inventory);

  assert.deepEqual(reasonCodes(report), [
    "SOURCE_EXTENSION_NAME_GENERIC",
    "SOURCE_EXTENSION_VERSION_MISSING",
    "SOURCE_EXTENSION_MEMBERSHIP_UNVERIFIED",
    "SOURCE_EXTENSION_MEMBERSHIP_TYPE_GENERIC",
    "SOURCE_EXTENSION_MEMBERSHIP_FINGERPRINT_INVALID",
    "TARGET_EXTENSION_NAME_MISSING",
    "TARGET_EXTENSION_VERSION_MISSING",
    "TARGET_EXTENSION_MEMBERSHIP_UNVERIFIED",
    "TARGET_EXTENSION_MEMBERSHIP_TYPE_MISSING",
    "TARGET_EXTENSION_MEMBERSHIP_FINGERPRINT_INVALID",
  ]);
});

test("surfaces every exact extension identity and membership mismatch on one candidate", async () => {
  const inventory = await syntheticInventory();
  const source = inventory.reviewedCandidates[2].sourceExtension;
  source.name = "other_synthetic_extension";
  source.version = "9.9.9-synthetic";
  source.membershipEvidenceType = "other_synthetic_membership_snapshot";
  source.membershipEvidenceSha256 =
    "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

  const report = await analyzeInventory(inventory);
  const entry = report.entries.find(({ archiveItemId }) => archiveItemId === "104");

  assert.equal(entry.classification, "unknown_conflict");
  assert.deepEqual(entry.reasonCodes, [
    "REVIEWED_EXTENSION_NAME_MISMATCH",
    "REVIEWED_EXTENSION_VERSION_MISMATCH",
    "REVIEWED_EXTENSION_MEMBERSHIP_TYPE_MISMATCH",
    "REVIEWED_EXTENSION_MEMBERSHIP_FINGERPRINT_MISMATCH",
  ]);
});

test("requires exact reviewed-target extension and membership evidence", async () => {
  const missing = await syntheticInventory();
  delete missing.reviewedCandidates[2].expectedTargetExtension.name;
  delete missing.reviewedCandidates[2].expectedTargetExtension.version;
  delete missing.reviewedCandidates[2].expectedTargetExtension.membershipEvidenceType;
  delete missing.reviewedCandidates[2].expectedTargetExtension.membershipEvidenceSha256;
  assert.deepEqual(reasonCodes(await analyzeInventory(missing)), [
    "EXPECTED_TARGET_EXTENSION_NAME_MISSING",
    "EXPECTED_TARGET_EXTENSION_VERSION_MISSING",
    "EXPECTED_TARGET_EXTENSION_MEMBERSHIP_TYPE_MISSING",
    "EXPECTED_TARGET_EXTENSION_MEMBERSHIP_FINGERPRINT_INVALID",
  ]);

  const mismatch = await syntheticInventory();
  mismatch.reviewedCandidates[2].expectedTargetExtension.membershipEvidenceSha256 =
    "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const report = await analyzeInventory(mismatch);
  const entry = report.entries.find(({ archiveItemId }) => archiveItemId === "104");
  assert.equal(
    entry.reasonCode,
    "REVIEWED_EXTENSION_MEMBERSHIP_FINGERPRINT_MISMATCH",
  );
});

test("blocks when target inventory content no longer matches its evidence hash", async () => {
  const inventory = await syntheticInventory();
  inventory.targetObjects[0].fingerprint =
    "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

  assert.deepEqual(reasonCodes(await analyzeInventory(inventory)), [
    "TARGET_INVENTORY_HASH_MISMATCH",
  ]);
});

test("invalid catalog metadata returns a hashed advisory blocked report", async () => {
  const report = analyzeRestorePlan({
    catalogText: await fixture("missing-id-catalog.list"),
    inventoryText: await fixture("synthetic-inventory.json"),
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.executablePlanEmitted, false);
  assert.deepEqual(reasonCodes(report), ["CATALOG_ITEM_ID_MISSING"]);
  assert.match(report.hashes.proposedPlanSha256, /^[a-f0-9]{64}$/);
});

test("surfaces multiple malformed catalog records without silently discarding them", async () => {
  const catalogText = [
    "; 1 0 synthetic metadata without item id",
    "not-a-catalog-record",
    "101; 0 1 TABLE app_sandbox first_table fixture_owner",
    "101; 0 2 TABLE app_sandbox second_table fixture_owner",
    "102; 0 3 TABLE app_sandbox missing_owner -",
  ].join("\n");
  const report = analyzeRestorePlan({
    catalogText,
    inventoryText: await fixture("synthetic-inventory.json"),
  });

  assert.deepEqual(reasonCodes(report), [
    "CATALOG_ITEM_ID_MISSING",
    "CATALOG_ITEM_ID_MISSING",
    "CATALOG_OWNER_MISSING",
    "CATALOG_ITEM_ID_DUPLICATE",
  ]);
});

test("blocks duplicate candidate IDs and unsupported management classifications", async () => {
  const inventory = await syntheticInventory();
  inventory.targetObjects[0].management = "elevated_owner_guess";
  const duplicate = structuredClone(inventory.reviewedCandidates[0]);
  duplicate.management = "application";
  inventory.reviewedCandidates.push(duplicate);

  assert.deepEqual(reasonCodes(await analyzeInventory(inventory)), [
    "TARGET_OBJECT_MANAGEMENT_UNSUPPORTED",
    "CANDIDATE_ARCHIVE_ITEM_ID_DUPLICATE",
    "CANDIDATE_MANAGEMENT_UNSUPPORTED",
  ]);
});

test("all safety evidence changes alter deterministic plan hashes", async () => {
  const baseline = await analyze();
  const mutations = [
    (inventory) => {
      inventory.reviewedCandidates[0].archiveItemId = "999";
    },
    (inventory) => {
      inventory.reviewedCandidates[0].schema = "other_synthetic_schema";
    },
    (inventory) => {
      inventory.reviewedCandidates[0].objectType = "TABLE";
    },
    (inventory) => {
      inventory.reviewedCandidates[0].name = "other_synthetic_object";
    },
    (inventory) => {
      inventory.reviewedCandidates[0].archiveOwner = "changed_fixture_owner";
    },
    (inventory) => {
      inventory.reviewedCandidates[0].expectedTargetOwner =
        "changed_target_owner";
    },
    (inventory) => {
      inventory.reviewedCandidates[2].sourceExtension.name =
        "other_synthetic_extension";
    },
    (inventory) => {
      inventory.reviewedCandidates[2].sourceExtension.version =
        "1.2.4-synthetic";
    },
    (inventory) => {
      inventory.reviewedCandidates[2].sourceExtension.membershipVerified = false;
    },
    (inventory) => {
      inventory.reviewedCandidates[2].sourceExtension.membershipEvidenceType =
        "other_synthetic_membership_snapshot";
    },
    (inventory) => {
      inventory.reviewedCandidates[2].sourceExtension.membershipEvidenceSha256 =
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    },
    (inventory) => {
      inventory.sourceVersion.postgresMajor = 16;
    },
    (inventory) => {
      inventory.targetVersion.postgresVersion = "15.9";
    },
    (inventory) => {
      inventory.targetVersion.supabaseImage =
        "synthetic-registry/postgres:15.8.1.synthetic";
    },
    (inventory) => {
      inventory.targetVersion.supabaseImage =
        "supabase/postgres:15.8.2.synthetic";
    },
    (inventory) => {
      inventory.targetVersion.supabaseImageDigest =
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    },
    (inventory) => {
      inventory.targetInventoryEvidence.version =
        "synthetic-bootstrap-inventory-v2";
    },
    (inventory) => {
      inventory.targetInventoryEvidence.sha256 =
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    },
    (inventory) => {
      inventory.reviewedCandidates[0].expectedTargetFingerprint =
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    },
    (inventory) => {
      inventory.reviewedCandidates[0].reasonCode =
        "OTHER_SYNTHETIC_BOOTSTRAP_REASON";
    },
    (inventory) => {
      inventory.reviewedCandidates.splice(0, 1);
    },
  ];

  for (const mutate of mutations) {
    const inventory = await syntheticInventory();
    mutate(inventory);
    const changed = await analyzeInventory(inventory);
    assert.notEqual(
      changed.hashes.proposedPlanSha256,
      baseline.hashes.proposedPlanSha256,
    );
  }
});

test("surfaces multiple independent candidate conflicts and reconciles counts", async () => {
  const inventory = await syntheticInventory();
  inventory.reviewedCandidates[0].archiveOwner = "unexpected_fixture_owner";
  inventory.reviewedCandidates[2].sourceExtension.version = "9.9.9-synthetic";

  const report = await analyzeInventory(inventory);
  const total = Object.values(report.summary).reduce((sum, count) => sum + count, 0);

  assert.equal(report.status, "blocked");
  assert.equal(report.summary.unknown_conflict, 2);
  assert.equal(report.entries.length, 7);
  assert.equal(total, report.entries.length);
  assert.equal(new Set(report.entries.map((entry) => entry.archiveItemId)).size, 7);
});

test("blocks candidate and target records with coded missing owner evidence", async () => {
  const missingTargetOwner = await syntheticInventory();
  delete missingTargetOwner.targetObjects[0].owner;
  assert.deepEqual(
    reasonCodes(await analyzeInventory(missingTargetOwner)),
    ["TARGET_OBJECT_OWNER_MISSING"],
  );

  const missingArchiveOwner = await syntheticInventory();
  delete missingArchiveOwner.reviewedCandidates[0].archiveOwner;
  assert.deepEqual(
    reasonCodes(await analyzeInventory(missingArchiveOwner)),
    ["CANDIDATE_ARCHIVE_OWNER_MISSING"],
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
  assert.deepEqual(
    reasonCodes(await analyzeInventory(missingSourceEvidence)),
    ["SOURCE_EXTENSION_EVIDENCE_MISSING"],
  );

  const unverifiedTargetMembership = await syntheticInventory();
  unverifiedTargetMembership.targetObjects[2].extension.membershipVerified = false;
  assert.deepEqual(
    reasonCodes(await analyzeInventory(unverifiedTargetMembership)),
    ["TARGET_EXTENSION_MEMBERSHIP_UNVERIFIED"],
  );
});

test("blocks extension candidate classification on extension version mismatch", async () => {
  const inventory = await syntheticInventory();
  inventory.reviewedCandidates[2].sourceExtension.version = "9.9.9-synthetic";

  const report = await analyzeInventory(inventory);

  assert.equal(report.status, "blocked");
  assert.equal(
    report.entries[3].reasonCode,
    "REVIEWED_EXTENSION_VERSION_MISMATCH",
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
  assert.equal(entry.reasonCode, "APPLICATION_OWNED_COLLISION");
});

test("blocks wildcard, schema-wide, and object-type-wide candidate syntax", async () => {
  assert.deepEqual(
    reasonCodes(await analyze("wildcard-inventory.json")),
    [
      "CANDIDATE_ARCHIVE_ITEM_ID_INVALID",
      "OBJECT_NAME_WILDCARD_FORBIDDEN",
      "SCHEMA_WIDE_EXCLUSION_FORBIDDEN",
      "CANDIDATE_ARCHIVE_OWNER_MISSING",
      "CANDIDATE_TARGET_OWNER_MISSING",
    ],
  );
  assert.deepEqual(
    reasonCodes(await analyze("schema-wide-inventory.json")),
    [
      "OBJECT_TYPE_WIDE_EXCLUSION_FORBIDDEN",
      "CANDIDATE_ARCHIVE_OWNER_MISSING",
      "CANDIDATE_TARGET_OWNER_MISSING",
    ],
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
  assert.deepEqual(reasonCodes(report), [
    "SOURCE_TARGET_POSTGRES_MAJOR_MISMATCH",
    "SOURCE_TARGET_POSTGRES_VERSION_MISMATCH",
    "DISTRIBUTION_IMAGE_TAG_MISMATCH",
    "DISTRIBUTION_IMAGE_DIGEST_MISMATCH",
  ]);
});

test("blocks a reviewed candidate when target inventory fingerprint differs", async () => {
  const report = await analyze("inventory-fingerprint-mismatch.json");
  const entry = report.entries.find(({ archiveItemId }) => archiveItemId === "102");

  assert.equal(report.status, "blocked");
  assert.equal(entry.classification, "unknown_conflict");
  assert.equal(
    entry.reasonCode,
    "TARGET_OBJECT_FINGERPRINT_MISMATCH",
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
    /sha256:5555555555555555555555555555555555555555555555555555555555555555/,
  );
  assert.match(
    markdown,
    /sha256:5555555555555555555555555555555555555555555555555555555555555555/,
  );
});

test("JSON property order does not alter advisory output or hashes", async () => {
  const inventory = await syntheticInventory();
  const baseline = await analyzeInventory(inventory);
  const reordered = analyzeRestorePlan({
    catalogText: await fixture("synthetic-catalog.list"),
    inventoryText: JSON.stringify(reverseObjectProperties(inventory), null, 2),
  });

  assert.deepEqual(reordered, baseline);
  assert.equal(
    reordered.hashes.proposedPlanSha256,
    baseline.hashes.proposedPlanSha256,
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
