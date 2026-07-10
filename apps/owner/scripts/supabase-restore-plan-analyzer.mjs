#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ADVISORY = "NOT APPROVED FOR RESTORE EXECUTION";
const CLASSIFICATIONS = [
  "restore",
  "exact_bootstrap_duplicate_candidate",
  "extension_managed_candidate",
  "unknown_conflict",
];
const OBJECT_TYPES = [
  "MATERIALIZED VIEW DATA",
  "TEXT SEARCH CONFIGURATION",
  "TEXT SEARCH DICTIONARY",
  "TEXT SEARCH TEMPLATE",
  "FOREIGN DATA WRAPPER",
  "PROCEDURAL LANGUAGE",
  "DATABASE PROPERTIES",
  "SEQUENCE OWNED BY",
  "PUBLICATION TABLE",
  "OPERATOR FAMILY",
  "OPERATOR CLASS",
  "BLOB COMMENTS",
  "TEXT SEARCH PARSER",
  "MATERIALIZED VIEW",
  "EVENT TRIGGER",
  "FOREIGN SERVER",
  "DEFAULT ACL",
  "USER MAPPING",
  "TABLE ATTACH",
  "INDEX ATTACH",
  "TABLE DATA",
  "SEQUENCE SET",
  "FK CONSTRAINT",
  "ROW SECURITY",
  "SUBSCRIPTION",
  "PUBLICATION",
  "STATISTICS",
  "AGGREGATE",
  "CONSTRAINT",
  "PROCEDURE",
  "EXTENSION",
  "FUNCTION",
  "SEQUENCE",
  "DATABASE",
  "COLLATION",
  "CONVERSION",
  "SCHEMA",
  "TABLE",
  "VIEW",
  "INDEX",
  "TRIGGER",
  "POLICY",
  "RULE",
  "TYPE",
  "DOMAIN",
  "OPERATOR",
  "COMMENT",
  "ACL",
  "CAST",
  "BLOB",
].sort((left, right) => right.length - left.length);

class AnalyzerValidationError extends Error {
  constructor(issues) {
    super(issues.map(({ message }) => message).join(" "));
    this.name = "AnalyzerValidationError";
    this.issues = issues;
  }
}

function validationIssue(reasonCode, message, context = {}) {
  return { reasonCode, message, ...context };
}

export function parseCatalog(catalogText) {
  const issues = [];
  validateSanitizedInput(catalogText, "catalog", issues);
  if (issues.length > 0) {
    throw new AnalyzerValidationError(issues);
  }

  const entries = [];

  for (const [index, sourceLine] of catalogText.split(/\r?\n/).entries()) {
    const line = sourceLine.trim();
    if (!line || line.startsWith(";") && !/^;\s+\d+\s+\d+/.test(line)) {
      continue;
    }

    if (line.startsWith(";") && /^;\s+\d+\s+\d+/.test(line)) {
      issues.push(
        validationIssue(
          "CATALOG_ITEM_ID_MISSING",
          `Catalog line ${index + 1} has no exact archive item ID.`,
          { line: index + 1 },
        ),
      );
      continue;
    }

    const match = line.match(/^(\d+);\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) {
      issues.push(
        validationIssue(
          "CATALOG_ITEM_ID_MISSING",
          `Catalog line ${index + 1} has no exact archive item ID.`,
          { line: index + 1 },
        ),
      );
      continue;
    }

    const [, archiveItemId, catalogOid, objectOid, descriptor] = match;
    const objectType = OBJECT_TYPES.find((candidate) =>
      descriptor.startsWith(`${candidate} `),
    );
    if (!objectType) {
      issues.push(
        validationIssue(
          "CATALOG_OBJECT_TYPE_UNSUPPORTED",
          `Catalog line ${index + 1} has an unsupported object type.`,
          { archiveItemId, line: index + 1 },
        ),
      );
      continue;
    }

    const objectMetadata = descriptor.slice(objectType.length + 1).trim().split(/\s+/);
    if (objectMetadata.length < 3) {
      issues.push(
        validationIssue(
          "CATALOG_OBJECT_METADATA_INCOMPLETE",
          `Catalog line ${index + 1} has incomplete object metadata.`,
          { archiveItemId, line: index + 1 },
        ),
      );
      continue;
    }

    const owner = objectMetadata.at(-1);
    const schemaToken = objectMetadata[0];
    const name = objectMetadata.slice(1, -1).join(" ");
    if (!name) {
      issues.push(
        validationIssue(
          "CATALOG_OBJECT_NAME_MISSING",
          `Catalog line ${index + 1} has no exact object name.`,
          { archiveItemId, line: index + 1 },
        ),
      );
      continue;
    }
    if (!owner || owner === "-" || containsWildcard(owner)) {
      issues.push(
        validationIssue(
          "CATALOG_OWNER_MISSING",
          `Catalog line ${index + 1} has no exact source owner evidence.`,
          { archiveItemId, line: index + 1 },
        ),
      );
      continue;
    }

    entries.push({
      archiveItemId,
      catalogOid,
      name,
      objectOid,
      objectType,
      owner,
      schema: schemaToken === "-" ? null : schemaToken,
    });
  }

  if (entries.length === 0 && issues.length === 0) {
    issues.push(
      validationIssue(
        "CATALOG_EMPTY",
        "Catalog contains no exact archive entries.",
      ),
    );
  }

  const seenIds = new Set();
  for (const entry of entries) {
    if (seenIds.has(entry.archiveItemId)) {
      issues.push(
        validationIssue(
          "CATALOG_ITEM_ID_DUPLICATE",
          `Duplicate archive item ID ${entry.archiveItemId}.`,
          { archiveItemId: entry.archiveItemId },
        ),
      );
    }
    seenIds.add(entry.archiveItemId);
  }

  if (issues.length > 0) {
    throw new AnalyzerValidationError(issues);
  }

  return entries.sort(compareArchiveIds);
}

export function analyzeRestorePlan({ catalogText, inventoryText }) {
  const catalogResult = captureValidation(() => parseCatalog(catalogText));
  const inventoryResult = captureValidation(() => parseInventory(inventoryText));
  const catalog = catalogResult.value ?? [];
  const inventory = inventoryResult.value ?? null;
  const validationConflicts = [
    ...catalogResult.issues,
    ...inventoryResult.issues,
  ];
  const catalogSha256 = hashParsedOrRaw(catalogResult.value, catalogText);
  const inventorySha256 = hashParsedOrRaw(inventoryResult.value, inventoryText);
  const inputsSha256 = sha256(
    canonicalStringify({ catalogSha256, inventorySha256 }),
  );

  if (validationConflicts.length > 0) {
    return createValidationBlockedReport({
      catalog,
      catalogSha256,
      inputsSha256,
      inventory,
      inventorySha256,
      validationConflicts,
    });
  }

  const targetObjectsByIdentity = groupTargetObjects(inventory.targetObjects);
  const candidatesByArchiveId = new Map(
    inventory.reviewedCandidates.map((candidate) => [
      candidate.archiveItemId,
      candidate,
    ]),
  );
  const catalogIds = new Set(catalog.map(({ archiveItemId }) => archiveItemId));
  const globalConflicts = platformCompatibilityConflicts(inventory);

  const versionChecks = {
    postgresMajor:
      inventory.sourceVersion.postgresMajor === inventory.targetVersion.postgresMajor,
    postgresVersion:
      inventory.sourceVersion.postgresVersion ===
      inventory.targetVersion.postgresVersion,
    supabaseImageName:
      inventory.sourceVersion.supabaseImageName ===
      inventory.targetVersion.supabaseImageName,
    supabaseImageTag:
      inventory.sourceVersion.supabaseImageTag ===
      inventory.targetVersion.supabaseImageTag,
    supabaseImageDigest:
      inventory.sourceVersion.supabaseImageDigest ===
      inventory.targetVersion.supabaseImageDigest,
  };
  const compatible = Object.values(versionChecks).every(Boolean);

  for (const candidate of inventory.reviewedCandidates) {
    if (!catalogIds.has(candidate.archiveItemId)) {
      globalConflicts.push({
        archiveItemId: candidate.archiveItemId,
        reasonCode: "REVIEWED_ID_NOT_PRESENT_IN_CATALOG",
        message: "A reviewed candidate does not identify a catalog entry.",
      });
    }
  }

  const entries = catalog.map((entry) =>
    classifyEntry({
      candidate: candidatesByArchiveId.get(entry.archiveItemId),
      entry,
      platformCompatible: compatible,
      targetObjects: targetObjectsByIdentity.get(identityKey(entry)) ?? [],
    }),
  );
  const summary = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [
      classification,
      entries.filter((entry) => entry.classification === classification).length,
    ]),
  );
  const blocked = summary.unknown_conflict > 0 || globalConflicts.length > 0;
  const reportWithoutPlanHash = {
    advisory: ADVISORY,
    schemaVersion: 2,
    status: blocked ? "blocked" : "review_required",
    executablePlanEmitted: false,
    versionCompatibility: {
      compatible,
      checks: versionChecks,
      source: inventory.sourceVersion,
      target: inventory.targetVersion,
    },
    targetInventoryEvidence: inventory.targetInventoryEvidence,
    hashes: {
      catalogSha256,
      inventorySha256,
      inputsSha256,
    },
    summary,
    globalConflicts,
    entries,
  };
  const proposedPlanSha256 = sha256(canonicalStringify(reportWithoutPlanHash));

  return {
    ...reportWithoutPlanHash,
    hashes: {
      ...reportWithoutPlanHash.hashes,
      proposedPlanSha256,
    },
  };
}

export function renderMarkdown(report) {
  const extensionEntries = report.entries.filter(
    (entry) => entry.sourceExtension && entry.targetExtension,
  );
  const lines = [
    "# Supabase Restore Plan Analysis",
    "",
    `> **${ADVISORY}.**`,
    "",
    `Status: **${report.status}**`,
    "",
    "This report is advisory. It contains no executable restore command or use-list.",
    "",
    "## Input And Plan Hashes",
    "",
    "| Artifact | SHA-256 |",
    "| --- | --- |",
    `| Catalog input | \`${report.hashes.catalogSha256}\` |`,
    `| Inventory input | \`${report.hashes.inventorySha256}\` |`,
    `| Combined inputs | \`${report.hashes.inputsSha256}\` |`,
    `| Proposed advisory plan | \`${report.hashes.proposedPlanSha256}\` |`,
    ...(report.targetInventoryEvidence
      ? [
          `| Target inventory (${escapeTable(report.targetInventoryEvidence.version)}) | \`${escapeTable(report.targetInventoryEvidence.sha256)}\` |`,
        ]
      : []),
    "",
    "## Summary",
    "",
    "| Classification | Count |",
    "| --- | ---: |",
    ...CLASSIFICATIONS.map(
      (classification) => `| ${classification} | ${report.summary[classification]} |`,
    ),
    "",
    "## Catalog Entries",
    "",
    "| ID | Schema | Type | Name | Archive owner | Target owner | Classification | Reason |",
    "| ---: | --- | --- | --- | --- | --- | --- | --- |",
    ...report.entries.map(
      (entry) =>
        `| ${escapeTable(entry.archiveItemId)} | ${escapeTable(entry.schema ?? "-")} | ${escapeTable(entry.objectType)} | ${escapeTable(entry.name)} | ${escapeTable(entry.archiveOwner)} | ${escapeTable(entry.targetOwner ?? "-")} | ${escapeTable(entry.classification)} | ${escapeTable(entry.reasonCode)} |`,
    ),
  ];

  if (extensionEntries.length > 0) {
    lines.push(
      "",
      "## Extension Evidence",
      "",
      "| ID | Source extension | Source membership evidence | Target extension | Target membership evidence |",
      "| ---: | --- | --- | --- | --- |",
      ...extensionEntries.map(
        (entry) =>
          `| ${escapeTable(entry.archiveItemId)} | ${escapeTable(`${entry.sourceExtension.name}@${entry.sourceExtension.version}`)} | ${escapeTable(`${entry.sourceExtension.membershipEvidenceType}: ${entry.sourceExtension.membershipEvidenceSha256}`)} | ${escapeTable(`${entry.targetExtension.name}@${entry.targetExtension.version}`)} | ${escapeTable(`${entry.targetExtension.membershipEvidenceType}: ${entry.targetExtension.membershipEvidenceSha256}`)} |`,
      ),
    );
  }

  if (report.globalConflicts.length > 0) {
    lines.push(
      "",
      "## Global Stop Conditions",
      "",
      ...report.globalConflicts.map(
        (conflict) => `- **${conflict.reasonCode}:** ${conflict.message}`,
      ),
    );
  }

  lines.push(
    "",
    "## Review Boundary",
    "",
    "Every candidate still requires human review and a separate Atlas approval gate. Unknown conflicts block any future execution packet.",
    "",
  );
  return lines.join("\n");
}

export async function writeAnalysisOutputs({ report, jsonPath, markdownPath }) {
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderMarkdown(report), "utf8"),
  ]);
}

function classifyEntry({ candidate, entry, platformCompatible, targetObjects }) {
  const base = {
    archiveItemId: entry.archiveItemId,
    archiveOwner: entry.owner,
    schema: entry.schema,
    objectType: entry.objectType,
    name: entry.name,
  };

  if (!candidate && targetObjects.length === 0) {
    return {
      ...base,
      classification: "restore",
      reasonCode: "NO_TARGET_OBJECT_MATCH",
      targetOwner: null,
      targetManagement: null,
    };
  }

  if (!candidate) {
    const applicationOwned = targetObjects.some(
      (target) => target.management === "application",
    );
    return {
      ...base,
      classification: "unknown_conflict",
      reasonCode: applicationOwned
        ? "APPLICATION_OWNED_COLLISION"
        : "TARGET_OBJECT_NOT_EXACTLY_REVIEWED",
      message: applicationOwned
        ? "An application-owned target collision cannot become an exclusion candidate."
        : "A target collision has no exact reviewed candidate.",
      targetOwner: uniqueValue(targetObjects, "owner"),
      targetManagement: uniqueManagement(targetObjects),
    };
  }

  const candidateMatchesEntry = sameIdentity(candidate, entry);
  if (!candidateMatchesEntry) {
    return {
      ...base,
      classification: "unknown_conflict",
      reasonCode: "REVIEWED_CANDIDATE_IDENTITY_MISMATCH",
      message: "The reviewed candidate identity does not exactly match the catalog entry.",
      targetOwner: uniqueValue(targetObjects, "owner"),
      targetManagement: uniqueManagement(targetObjects),
    };
  }

  if (targetObjects.length !== 1) {
    return {
      ...base,
      classification: "unknown_conflict",
      reasonCode: "TARGET_OBJECT_MATCH_COUNT_MISMATCH",
      message: "The target inventory must contain exactly one matching object.",
      targetOwner: uniqueValue(targetObjects, "owner"),
      targetManagement: uniqueManagement(targetObjects),
    };
  }

  const matchingTarget = targetObjects[0];
  if (matchingTarget.management !== candidate.management) {
    return {
      ...base,
      classification: "unknown_conflict",
      reasonCode: "REVIEWED_CANDIDATE_MANAGEMENT_MISMATCH",
      message: "The reviewed management class does not match the target inventory.",
      targetOwner: matchingTarget.owner,
      targetManagement: matchingTarget.management,
    };
  }

  if (matchingTarget.fingerprint !== candidate.expectedTargetFingerprint) {
    return {
      ...base,
      classification: "unknown_conflict",
      reasonCode: "TARGET_OBJECT_FINGERPRINT_MISMATCH",
      message: "The exact target object fingerprint does not match the reviewed evidence.",
      targetOwner: matchingTarget.owner,
      targetManagement: matchingTarget.management,
    };
  }

  if (
    candidate.archiveOwner !== entry.owner ||
    candidate.expectedTargetOwner !== matchingTarget.owner
  ) {
    return {
      ...base,
      classification: "unknown_conflict",
      reasonCode: "REVIEWED_CANDIDATE_OWNER_MISMATCH",
      message: "Archive and target owners must match the exact reviewed owner evidence.",
      targetOwner: matchingTarget.owner,
      targetManagement: matchingTarget.management,
    };
  }

  if (!platformCompatible) {
    return {
      ...base,
      classification: "unknown_conflict",
      reasonCode: "PLATFORM_COMPATIBILITY_BLOCKED",
      message: "Exact PostgreSQL and distribution image evidence must match before candidate classification.",
      targetOwner: matchingTarget.owner,
      targetManagement: matchingTarget.management,
    };
  }

  if (candidate.management === "extension") {
    const extensionConflicts = extensionEvidenceConflicts({
      candidate,
      target: matchingTarget,
    });
    if (extensionConflicts.length > 0) {
      return {
        ...base,
        classification: "unknown_conflict",
        reasonCode: extensionConflicts[0].reasonCode,
        reasonCodes: extensionConflicts.map(({ reasonCode }) => reasonCode),
        messages: extensionConflicts.map(({ message }) => message),
        targetOwner: matchingTarget.owner,
        targetManagement: matchingTarget.management,
        sourceExtension: normalizeExtensionEvidence(candidate.sourceExtension),
        expectedTargetExtension: normalizeExtensionEvidence(
          candidate.expectedTargetExtension,
        ),
        targetExtension: normalizeExtensionEvidence(matchingTarget.extension),
      };
    }
  }

  return {
    ...base,
    classification:
      candidate.management === "bootstrap"
        ? "exact_bootstrap_duplicate_candidate"
        : "extension_managed_candidate",
    reasonCode: candidate.reasonCode,
    targetOwner: matchingTarget.owner,
    targetManagement: matchingTarget.management,
    targetFingerprint: matchingTarget.fingerprint,
    sourceExtension: candidate.sourceExtension
      ? normalizeExtensionEvidence(candidate.sourceExtension)
      : null,
    targetExtension: matchingTarget.extension
      ? normalizeExtensionEvidence(matchingTarget.extension)
      : null,
  };
}

function parseInventory(inventoryText) {
  const issues = [];
  validateSanitizedInput(inventoryText, "inventory", issues);
  if (issues.length > 0) {
    throw new AnalyzerValidationError(issues);
  }

  let inventory;
  try {
    inventory = JSON.parse(inventoryText);
  } catch {
    throw new AnalyzerValidationError([
      validationIssue("INVENTORY_JSON_INVALID", "Inventory must be valid JSON."),
    ]);
  }

  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    throw new AnalyzerValidationError([
      validationIssue(
        "INVENTORY_ROOT_INVALID",
        "Inventory root must be an object.",
      ),
    ]);
  }
  if (inventory.formatVersion !== 2) {
    issues.push(
      validationIssue(
        "INVENTORY_FORMAT_UNSUPPORTED",
        "Inventory formatVersion must be exactly 2.",
      ),
    );
  }
  validateVersion(inventory.sourceVersion, "SOURCE", issues);
  validateVersion(inventory.targetVersion, "TARGET", issues);
  validateTargetInventoryEvidence(inventory.targetInventoryEvidence, issues);
  if (!Array.isArray(inventory.targetObjects)) {
    issues.push(
      validationIssue(
        "TARGET_OBJECTS_MISSING",
        "Inventory targetObjects must be an array.",
      ),
    );
  }
  if (!Array.isArray(inventory.reviewedCandidates)) {
    issues.push(
      validationIssue(
        "REVIEWED_CANDIDATES_MISSING",
        "Inventory reviewedCandidates must be an array.",
      ),
    );
  }

  const targetExtensionIssues = [];
  const targetObjects = Array.isArray(inventory.targetObjects)
    ? inventory.targetObjects
    : [];
  for (const [index, target] of targetObjects.entries()) {
    const context = { targetObjectIndex: index };
    validateIdentity(target, "TARGET_OBJECT", issues, context);
    if (!["application", "bootstrap", "extension", "unknown"].includes(target.management)) {
      issues.push(
        validationIssue(
          "TARGET_OBJECT_MANAGEMENT_UNSUPPORTED",
          "Target object management is invalid.",
          context,
        ),
      );
    }
    validateOwner(
      target.owner,
      "TARGET_OBJECT_OWNER_MISSING",
      "Target object owner evidence must be exact.",
      issues,
      context,
    );
    validateFingerprint(
      target.fingerprint,
      "TARGET_OBJECT_FINGERPRINT_INVALID",
      "Target object fingerprint must be an exact SHA-256 fingerprint.",
      issues,
      context,
    );
    if (target.management === "extension") {
      validateExtensionEvidence(
        target.extension,
        "TARGET_EXTENSION",
        targetExtensionIssues,
        context,
      );
    }
  }

  const candidateIds = new Set();
  const reviewedCandidates = Array.isArray(inventory.reviewedCandidates)
    ? inventory.reviewedCandidates
    : [];
  for (const [index, candidate] of reviewedCandidates.entries()) {
    const context = { reviewedCandidateIndex: index };
    if (!candidate.archiveItemId || !/^\d+$/.test(candidate.archiveItemId)) {
      issues.push(
        validationIssue(
          "CANDIDATE_ARCHIVE_ITEM_ID_INVALID",
          "Every reviewed candidate requires an exact numeric archive item ID; wildcard and wide exclusions are forbidden.",
          context,
        ),
      );
    }
    if (candidateIds.has(candidate.archiveItemId)) {
      issues.push(
        validationIssue(
          "CANDIDATE_ARCHIVE_ITEM_ID_DUPLICATE",
          `Duplicate reviewed archive item ID ${candidate.archiveItemId}.`,
          { ...context, archiveItemId: candidate.archiveItemId },
        ),
      );
    }
    candidateIds.add(candidate.archiveItemId);
    validateIdentity(candidate, "CANDIDATE", issues, context);
    if (!["bootstrap", "extension"].includes(candidate.management)) {
      issues.push(
        validationIssue(
          "CANDIDATE_MANAGEMENT_UNSUPPORTED",
          "Reviewed candidates may only be bootstrap or extension managed.",
          context,
        ),
      );
    }
    validateOwner(
      candidate.archiveOwner,
      "CANDIDATE_ARCHIVE_OWNER_MISSING",
      "Reviewed candidate archive owner evidence must be exact.",
      issues,
      context,
    );
    validateOwner(
      candidate.expectedTargetOwner,
      "CANDIDATE_TARGET_OWNER_MISSING",
      "Reviewed candidate target owner evidence must be exact.",
      issues,
      context,
    );
    if (!/^[A-Z][A-Z0-9_]+$/.test(candidate.reasonCode ?? "")) {
      issues.push(
        validationIssue(
          "CANDIDATE_REASON_CODE_INVALID",
          "Every reviewed candidate requires a stable machine reason code.",
          context,
        ),
      );
    }
    validateFingerprint(
      candidate.expectedTargetFingerprint,
      "CANDIDATE_TARGET_FINGERPRINT_INVALID",
      "Expected target fingerprint must be an exact SHA-256 fingerprint.",
      issues,
      context,
    );
    if (candidate.management === "extension") {
      validateExtensionEvidence(
        candidate.sourceExtension,
        "SOURCE_EXTENSION",
        issues,
        context,
      );
      validateExtensionEvidence(
        candidate.expectedTargetExtension,
        "EXPECTED_TARGET_EXTENSION",
        issues,
        context,
      );
    }
  }
  issues.push(...targetExtensionIssues);

  if (issues.length > 0) {
    throw new AnalyzerValidationError(issues);
  }

  const normalized = normalizeInventory(inventory);
  const computedTargetInventorySha256 = targetInventorySha256(normalized);
  if (
    normalized.targetInventoryEvidence.sha256 !==
    `sha256:${computedTargetInventorySha256}`
  ) {
    throw new AnalyzerValidationError([
      validationIssue(
        "TARGET_INVENTORY_HASH_MISMATCH",
        "Target inventory evidence hash does not match the canonical target object inventory.",
      ),
    ]);
  }

  return normalized;
}

function validateVersion(version, prefix, issues) {
  if (!version || typeof version !== "object" || Array.isArray(version)) {
    issues.push(
      validationIssue(
        `${prefix}_PLATFORM_EVIDENCE_MISSING`,
        `${prefix.toLowerCase()} platform evidence is required.`,
      ),
    );
    return;
  }
  if (!Number.isInteger(version?.postgresMajor) || version.postgresMajor <= 0) {
    issues.push(
      validationIssue(
        `${prefix}_POSTGRES_MAJOR_INVALID`,
        `${prefix.toLowerCase()} postgresMajor must be a positive integer.`,
      ),
    );
  }
  if (typeof version.supabaseImage !== "string" || !version.supabaseImage.trim()) {
    issues.push(
      validationIssue(
        `${prefix}_IMAGE_EVIDENCE_MISSING`,
        `${prefix.toLowerCase()} distribution image name and tag are required.`,
      ),
    );
  }
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version.postgresVersion ?? "")) {
    issues.push(
      validationIssue(
        `${prefix}_POSTGRES_VERSION_INVALID`,
        `${prefix.toLowerCase()} postgresVersion must be an exact numeric version.`,
      ),
    );
  }
  if (
    /^\d+\.\d+(?:\.\d+)?$/.test(version.postgresVersion ?? "") &&
    Number.isInteger(version.postgresMajor) &&
    Number.parseInt(version.postgresVersion, 10) !== version.postgresMajor
  ) {
    issues.push(
      validationIssue(
        `${prefix}_POSTGRES_VERSION_MAJOR_INCONSISTENT`,
        `${prefix.toLowerCase()} postgresVersion must match postgresMajor.`,
      ),
    );
  }
  if (
    typeof version.supabaseImage === "string" &&
    version.supabaseImage.trim() &&
    !/^[^\s/:]+\/[^\s:]+:[^\s:]+$/.test(version.supabaseImage)
  ) {
    issues.push(
      validationIssue(
        `${prefix}_IMAGE_REFERENCE_INVALID`,
        `${prefix.toLowerCase()} distribution image must use an exact name and tag.`,
      ),
    );
  }
  if (/:(?:latest|stable|edge|main)$/i.test(version.supabaseImage)) {
    issues.push(
      validationIssue(
        `${prefix}_IMAGE_TAG_FLOATING`,
        `${prefix.toLowerCase()} distribution image may not use a floating tag.`,
      ),
    );
  }
  validateFingerprint(
    version.supabaseImageDigest,
    `${prefix}_IMAGE_DIGEST_INVALID`,
    `${prefix.toLowerCase()} distribution image digest must be an exact SHA-256 fingerprint.`,
    issues,
  );
}

function validateTargetInventoryEvidence(value, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(
      validationIssue(
        "TARGET_INVENTORY_EVIDENCE_MISSING",
        "Target inventory version and SHA-256 evidence are required.",
      ),
    );
    return;
  }
  if (
    typeof value.version !== "string" ||
    !value.version.trim() ||
    containsWildcard(value.version)
  ) {
    issues.push(
      validationIssue(
        "TARGET_INVENTORY_VERSION_MISSING",
        "Target inventory evidence requires an exact version.",
      ),
    );
  }
  validateFingerprint(
    value.sha256,
    "TARGET_INVENTORY_HASH_INVALID",
    "Target inventory evidence requires an exact SHA-256 fingerprint.",
    issues,
  );
}

function validateOwner(value, reasonCode, message, issues, context = {}) {
  if (typeof value !== "string" || !value.trim() || containsWildcard(value)) {
    issues.push(validationIssue(reasonCode, message, context));
  }
}

function validateExtensionEvidence(value, prefix, issues, context = {}) {
  if (!value || typeof value !== "object") {
    issues.push(
      validationIssue(
        `${prefix}_EVIDENCE_MISSING`,
        `${extensionLabel(prefix)} evidence is required.`,
        context,
      ),
    );
    return;
  }
  if (
    typeof value.name !== "string" ||
    !value.name.trim() ||
    containsWildcard(value.name)
  ) {
    issues.push(
      validationIssue(
        `${prefix}_NAME_MISSING`,
        `${extensionLabel(prefix)} name must be exact.`,
        context,
      ),
    );
  } else if (isGenericEvidenceLabel(value.name)) {
    issues.push(
      validationIssue(
        `${prefix}_NAME_GENERIC`,
        `${extensionLabel(prefix)} name must identify an exact extension, not a generic label.`,
        context,
      ),
    );
  }
  if (
    typeof value.version !== "string" ||
    !value.version.trim() ||
    containsWildcard(value.version)
  ) {
    issues.push(
      validationIssue(
        `${prefix}_VERSION_MISSING`,
        `${extensionLabel(prefix)} version must be exact.`,
        context,
      ),
    );
  }
  if (value.membershipVerified !== true) {
    issues.push(
      validationIssue(
        `${prefix}_MEMBERSHIP_UNVERIFIED`,
        `${extensionLabel(prefix)} membership must be independently verified.`,
        context,
      ),
    );
  }
  if (
    typeof value.membershipEvidenceType !== "string" ||
    !value.membershipEvidenceType.trim() ||
    containsWildcard(value.membershipEvidenceType)
  ) {
    issues.push(
      validationIssue(
        `${prefix}_MEMBERSHIP_TYPE_MISSING`,
        `${extensionLabel(prefix)} membership evidence type must be exact.`,
        context,
      ),
    );
  } else if (isGenericEvidenceLabel(value.membershipEvidenceType)) {
    issues.push(
      validationIssue(
        `${prefix}_MEMBERSHIP_TYPE_GENERIC`,
        `${extensionLabel(prefix)} membership evidence type must identify an exact evidence source.`,
        context,
      ),
    );
  }
  validateFingerprint(
    value.membershipEvidenceSha256,
    `${prefix}_MEMBERSHIP_FINGERPRINT_INVALID`,
    `${extensionLabel(prefix)} membership evidence must be an exact SHA-256 fingerprint.`,
    issues,
    context,
  );
}

function validateIdentity(value, prefix, issues, context = {}) {
  if (typeof value?.objectType !== "string" || !value.objectType.trim()) {
    issues.push(
      validationIssue(
        `${prefix}_OBJECT_TYPE_MISSING`,
        `${identityLabel(prefix)} requires an exact objectType.`,
        context,
      ),
    );
  } else if (isWideObjectType(value.objectType)) {
    issues.push(
      validationIssue(
        "OBJECT_TYPE_WIDE_EXCLUSION_FORBIDDEN",
        "Object-type-wide exclusions are forbidden.",
        context,
      ),
    );
  } else if (!OBJECT_TYPES.includes(value.objectType)) {
    issues.push(
      validationIssue(
        `${prefix}_OBJECT_TYPE_UNSUPPORTED`,
        `${identityLabel(prefix)} objectType is unsupported.`,
        context,
      ),
    );
  }
  if (typeof value?.name !== "string" || !value.name.trim()) {
    issues.push(
      validationIssue(
        `${prefix}_OBJECT_NAME_MISSING`,
        `${identityLabel(prefix)} requires an exact object name.`,
        context,
      ),
    );
  } else if (containsWildcard(value.name)) {
    issues.push(
      validationIssue(
        "OBJECT_NAME_WILDCARD_FORBIDDEN",
        "Wildcard object names are forbidden.",
        context,
      ),
    );
  }
  if (value.schema !== null && (typeof value.schema !== "string" || !value.schema.trim())) {
    issues.push(
      validationIssue(
        `${prefix}_SCHEMA_INVALID`,
        `${identityLabel(prefix)} schema must be an exact string or null.`,
        context,
      ),
    );
  }
  if (containsWildcard(value.schema)) {
    issues.push(
      validationIssue(
        "SCHEMA_WIDE_EXCLUSION_FORBIDDEN",
        "Wildcard and schema-wide exclusions are forbidden.",
        context,
      ),
    );
  }
}

function validateFingerprint(value, reasonCode, message, issues, context = {}) {
  if (!/^sha256:[a-f0-9]{64}$/.test(value ?? "")) {
    issues.push(validationIssue(reasonCode, message, context));
  }
}

function containsWildcard(value) {
  return typeof value === "string" && /[*?]|schema[-_ ]?wide/i.test(value);
}

function isWideObjectType(value) {
  return containsWildcard(value) || /(?:^|[_ -])(?:ALL|ANY|WIDE)(?:$|[_ -])/i.test(value);
}

function isGenericEvidenceLabel(value) {
  return /^(?:extension|managed|auth[-_ ]?like|vault[-_ ]?like)$/i.test(value);
}

function extensionLabel(prefix) {
  return prefix.toLowerCase().replaceAll("_", " ");
}

function identityLabel(prefix) {
  return prefix === "CANDIDATE" ? "Reviewed candidate" : "Target object";
}

function normalizeInventory(inventory) {
  return {
    formatVersion: inventory.formatVersion,
    sourceVersion: normalizeVersion(inventory.sourceVersion),
    targetVersion: normalizeVersion(inventory.targetVersion),
    targetInventoryEvidence: {
      version: inventory.targetInventoryEvidence.version,
      sha256: inventory.targetInventoryEvidence.sha256,
    },
    targetObjects: inventory.targetObjects
      .map((target) => ({
        schema: target.schema,
        objectType: target.objectType,
        name: target.name,
        management: target.management,
        owner: target.owner,
        fingerprint: target.fingerprint,
        ...(target.extension
          ? { extension: normalizeExtensionEvidence(target.extension) }
          : {}),
      }))
      .sort((left, right) =>
        canonicalStringify(left).localeCompare(canonicalStringify(right)),
      ),
    reviewedCandidates: inventory.reviewedCandidates
      .map((candidate) => ({
        archiveItemId: candidate.archiveItemId,
        schema: candidate.schema,
        objectType: candidate.objectType,
        name: candidate.name,
        management: candidate.management,
        archiveOwner: candidate.archiveOwner,
        expectedTargetOwner: candidate.expectedTargetOwner,
        reasonCode: candidate.reasonCode,
        expectedTargetFingerprint: candidate.expectedTargetFingerprint,
        ...(candidate.sourceExtension
          ? {
              sourceExtension: normalizeExtensionEvidence(
                candidate.sourceExtension,
              ),
            }
          : {}),
        ...(candidate.expectedTargetExtension
          ? {
              expectedTargetExtension: normalizeExtensionEvidence(
                candidate.expectedTargetExtension,
              ),
            }
          : {}),
      }))
      .sort(compareArchiveIds),
  };
}

function targetInventorySha256(inventory) {
  return sha256(
    canonicalStringify({
      version: inventory.targetInventoryEvidence.version,
      targetObjects: inventory.targetObjects,
    }),
  );
}

function normalizeVersion(version) {
  const { name, tag } = splitImageReference(version.supabaseImage);
  return {
    postgresMajor: version.postgresMajor,
    postgresVersion: version.postgresVersion,
    supabaseImage: version.supabaseImage,
    supabaseImageName: name,
    supabaseImageTag: tag,
    supabaseImageDigest: version.supabaseImageDigest,
  };
}

function normalizeExtensionEvidence(extension) {
  return {
    name: extension.name,
    version: extension.version,
    membershipVerified: extension.membershipVerified,
    membershipEvidenceType: extension.membershipEvidenceType,
    membershipEvidenceSha256: extension.membershipEvidenceSha256,
  };
}

function splitImageReference(reference) {
  const separator = reference.lastIndexOf(":");
  return {
    name: reference.slice(0, separator),
    tag: reference.slice(separator + 1),
  };
}

function captureValidation(callback) {
  try {
    return { value: callback(), issues: [] };
  } catch (error) {
    if (error instanceof AnalyzerValidationError) {
      return { value: null, issues: error.issues };
    }
    throw error;
  }
}

function hashParsedOrRaw(parsed, raw) {
  return sha256(
    parsed === null || parsed === undefined
      ? typeof raw === "string"
        ? raw
        : canonicalStringify(raw)
      : canonicalStringify(parsed),
  );
}

function createValidationBlockedReport({
  catalog,
  catalogSha256,
  inputsSha256,
  inventory,
  inventorySha256,
  validationConflicts,
}) {
  const entries = catalog.map((entry) => ({
    archiveItemId: entry.archiveItemId,
    archiveOwner: entry.owner,
    schema: entry.schema,
    objectType: entry.objectType,
    name: entry.name,
    classification: "unknown_conflict",
    reasonCode: "INPUT_VALIDATION_BLOCKED",
    message: "Input evidence validation failed; no candidate classification is permitted.",
    targetOwner: null,
    targetManagement: null,
  }));
  const summary = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [
      classification,
      entries.filter((entry) => entry.classification === classification).length,
    ]),
  );
  const reportWithoutPlanHash = {
    advisory: ADVISORY,
    schemaVersion: 2,
    status: "blocked",
    executablePlanEmitted: false,
    versionCompatibility: {
      compatible: false,
      checks: {
        postgresMajor: null,
        postgresVersion: null,
        supabaseImageName: null,
        supabaseImageTag: null,
        supabaseImageDigest: null,
      },
      source: inventory?.sourceVersion ?? null,
      target: inventory?.targetVersion ?? null,
    },
    targetInventoryEvidence: inventory?.targetInventoryEvidence ?? null,
    hashes: {
      catalogSha256,
      inventorySha256,
      inputsSha256,
    },
    summary,
    globalConflicts: validationConflicts,
    entries,
  };
  const proposedPlanSha256 = sha256(canonicalStringify(reportWithoutPlanHash));

  return {
    ...reportWithoutPlanHash,
    hashes: {
      ...reportWithoutPlanHash.hashes,
      proposedPlanSha256,
    },
  };
}

function platformCompatibilityConflicts(inventory) {
  const checks = [
    [
      inventory.sourceVersion.postgresMajor ===
        inventory.targetVersion.postgresMajor,
      "SOURCE_TARGET_POSTGRES_MAJOR_MISMATCH",
      "Source and target PostgreSQL major versions must match exactly.",
    ],
    [
      inventory.sourceVersion.postgresVersion ===
        inventory.targetVersion.postgresVersion,
      "SOURCE_TARGET_POSTGRES_VERSION_MISMATCH",
      "Source and target full PostgreSQL versions must match exactly.",
    ],
    [
      inventory.sourceVersion.supabaseImageName ===
        inventory.targetVersion.supabaseImageName,
      "DISTRIBUTION_IMAGE_NAME_MISMATCH",
      "Source and target distribution image names must match exactly.",
    ],
    [
      inventory.sourceVersion.supabaseImageTag ===
        inventory.targetVersion.supabaseImageTag,
      "DISTRIBUTION_IMAGE_TAG_MISMATCH",
      "Source and target pinned distribution image tags must match exactly.",
    ],
    [
      inventory.sourceVersion.supabaseImageDigest ===
        inventory.targetVersion.supabaseImageDigest,
      "DISTRIBUTION_IMAGE_DIGEST_MISMATCH",
      "Source and target distribution image digests must match exactly.",
    ],
  ];

  return checks
    .filter(([matches]) => !matches)
    .map(([, reasonCode, message]) => ({ reasonCode, message }));
}

function groupTargetObjects(targetObjects) {
  const grouped = new Map();
  for (const target of targetObjects) {
    const key = identityKey(target);
    grouped.set(key, [...(grouped.get(key) ?? []), target]);
  }
  return grouped;
}

function identityKey(value) {
  return canonicalStringify({
    schema: value.schema,
    objectType: value.objectType,
    name: value.name,
  });
}

function sameIdentity(left, right) {
  return identityKey(left) === identityKey(right);
}

function uniqueManagement(targetObjects) {
  const management = [...new Set(targetObjects.map((target) => target.management))];
  return management.length === 1 ? management[0] : "mixed";
}

function uniqueValue(values, field) {
  const exactValues = [...new Set(values.map((value) => value[field]))];
  return exactValues.length === 1 ? exactValues[0] : null;
}

function extensionEvidenceConflicts({ candidate, target }) {
  const source = candidate.sourceExtension;
  const expectedTarget = candidate.expectedTargetExtension;
  const actualTarget = target.extension;
  const conflicts = [];

  if (
    source.name !== expectedTarget.name ||
    expectedTarget.name !== actualTarget.name
  ) {
    conflicts.push(
      validationIssue(
        "REVIEWED_EXTENSION_NAME_MISMATCH",
        "Source, reviewed target, and actual target extension names must match exactly.",
      ),
    );
  }
  if (
    source.version !== expectedTarget.version ||
    expectedTarget.version !== actualTarget.version
  ) {
    conflicts.push(
      validationIssue(
        "REVIEWED_EXTENSION_VERSION_MISMATCH",
        "Source, reviewed target, and actual target extension versions must match exactly.",
      ),
    );
  }
  if (
    source.membershipEvidenceType !== expectedTarget.membershipEvidenceType ||
    expectedTarget.membershipEvidenceType !== actualTarget.membershipEvidenceType
  ) {
    conflicts.push(
      validationIssue(
        "REVIEWED_EXTENSION_MEMBERSHIP_TYPE_MISMATCH",
        "Source, reviewed target, and actual target membership evidence types must match exactly.",
      ),
    );
  }
  if (
    source.membershipEvidenceSha256 !==
      expectedTarget.membershipEvidenceSha256 ||
    expectedTarget.membershipEvidenceSha256 !==
      actualTarget.membershipEvidenceSha256
  ) {
    conflicts.push(
      validationIssue(
        "REVIEWED_EXTENSION_MEMBERSHIP_FINGERPRINT_MISMATCH",
        "Source, reviewed target, and actual target membership evidence fingerprints must match exactly.",
      ),
    );
  }

  return conflicts;
}

function compareArchiveIds(left, right) {
  const leftId = BigInt(left.archiveItemId);
  const rightId = BigInt(right.archiveItemId);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function validateSanitizedInput(value, label, issues) {
  const prefix = label.toUpperCase();
  if (typeof value !== "string" || !value.trim()) {
    issues.push(
      validationIssue(
        `${prefix}_INPUT_MISSING`,
        `${label} input must be a non-empty local text file.`,
      ),
    );
    return;
  }
  if (/:\/\//.test(value) || /\b(?:password|access_token|refresh_token)\s*[:=]/i.test(value)) {
    issues.push(
      validationIssue(
        `${prefix}_INPUT_NOT_SANITIZED`,
        `${label} input appears to contain a URL or credential material.`,
      ),
    );
  }
}

function parseArguments(argv) {
  const argumentsByName = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value) {
      throw new Error("Arguments must be supplied as exact --name local-path pairs.");
    }
    argumentsByName[name.slice(2)] = value;
  }
  for (const required of ["catalog", "inventory", "json", "markdown"]) {
    if (!argumentsByName[required]) {
      throw new Error(`Missing required --${required} local path.`);
    }
  }
  return argumentsByName;
}

async function main() {
  const argumentsByName = parseArguments(process.argv.slice(2));
  const [catalogText, inventoryText] = await Promise.all([
    readFile(argumentsByName.catalog, "utf8"),
    readFile(argumentsByName.inventory, "utf8"),
  ]);
  const report = analyzeRestorePlan({ catalogText, inventoryText });
  await writeAnalysisOutputs({
    report,
    jsonPath: argumentsByName.json,
    markdownPath: argumentsByName.markdown,
  });
  process.stdout.write(`${ADVISORY}: ${report.status}\n`);
  if (report.status === "blocked") {
    process.exitCode = 2;
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`Analyzer error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
