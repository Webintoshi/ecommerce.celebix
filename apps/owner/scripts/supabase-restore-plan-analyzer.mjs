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

export function parseCatalog(catalogText) {
  assertSanitizedInput(catalogText, "catalog");
  const entries = [];
  const invalidMetadataLines = [];

  for (const [index, sourceLine] of catalogText.split(/\r?\n/).entries()) {
    const line = sourceLine.trim();
    if (!line || line.startsWith(";") && !/^;\s+\d+\s+\d+/.test(line)) {
      continue;
    }

    if (line.startsWith(";") && /^;\s+\d+\s+\d+/.test(line)) {
      invalidMetadataLines.push(index + 1);
      continue;
    }

    const match = line.match(/^(\d+);\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) {
      throw new Error(`Catalog line ${index + 1} has no exact archive item ID.`);
    }

    const [, archiveItemId, catalogOid, objectOid, descriptor] = match;
    const objectType = OBJECT_TYPES.find((candidate) =>
      descriptor.startsWith(`${candidate} `),
    );
    if (!objectType) {
      throw new Error(`Catalog line ${index + 1} has an unsupported object type.`);
    }

    const objectMetadata = descriptor.slice(objectType.length + 1).trim().split(/\s+/);
    if (objectMetadata.length < 3) {
      throw new Error(`Catalog line ${index + 1} has incomplete object metadata.`);
    }

    const owner = objectMetadata.at(-1);
    const schemaToken = objectMetadata[0];
    const name = objectMetadata.slice(1, -1).join(" ");
    if (!name) {
      throw new Error(`Catalog line ${index + 1} has no exact object name.`);
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

  if (invalidMetadataLines.length > 0 || entries.length === 0) {
    throw new Error("Catalog contains an entry without an exact archive item ID.");
  }

  const seenIds = new Set();
  for (const entry of entries) {
    if (seenIds.has(entry.archiveItemId)) {
      throw new Error(`Duplicate archive item ID ${entry.archiveItemId}.`);
    }
    seenIds.add(entry.archiveItemId);
  }

  return entries.sort(compareArchiveIds);
}

export function analyzeRestorePlan({ catalogText, inventoryText }) {
  assertSanitizedInput(inventoryText, "inventory");
  const catalog = parseCatalog(catalogText);
  const inventory = parseInventory(inventoryText);
  const targetObjectsByIdentity = groupTargetObjects(inventory.targetObjects);
  const candidatesByArchiveId = new Map(
    inventory.reviewedCandidates.map((candidate) => [
      candidate.archiveItemId,
      candidate,
    ]),
  );
  const catalogIds = new Set(catalog.map(({ archiveItemId }) => archiveItemId));
  const globalConflicts = [];

  const compatible =
    inventory.sourceVersion.postgresMajor === inventory.targetVersion.postgresMajor &&
    inventory.sourceVersion.supabaseImage === inventory.targetVersion.supabaseImage;
  if (!compatible) {
    globalConflicts.push({
      reasonCode: "SOURCE_TARGET_VERSION_MISMATCH",
      message: "Source and target PostgreSQL/Supabase versions are not exact matches.",
    });
  }

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
  const catalogSha256 = sha256(catalogText);
  const inventorySha256 = sha256(inventoryText);
  const inputsSha256 = sha256(
    canonicalStringify({ catalogSha256, inventorySha256 }),
  );
  const reportWithoutPlanHash = {
    advisory: ADVISORY,
    schemaVersion: 1,
    status: blocked ? "blocked" : "review_required",
    executablePlanEmitted: false,
    versionCompatibility: {
      compatible,
      source: inventory.sourceVersion,
      target: inventory.targetVersion,
    },
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
    "| ID | Schema | Type | Name | Classification | Reason |",
    "| ---: | --- | --- | --- | --- | --- |",
    ...report.entries.map(
      (entry) =>
        `| ${escapeTable(entry.archiveItemId)} | ${escapeTable(entry.schema ?? "-")} | ${escapeTable(entry.objectType)} | ${escapeTable(entry.name)} | ${escapeTable(entry.classification)} | ${escapeTable(entry.reasonCode)} |`,
    ),
  ];

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

function classifyEntry({ candidate, entry, targetObjects }) {
  const base = {
    archiveItemId: entry.archiveItemId,
    schema: entry.schema,
    objectType: entry.objectType,
    name: entry.name,
  };

  if (!candidate && targetObjects.length === 0) {
    return {
      ...base,
      classification: "restore",
      reasonCode: "NO_TARGET_OBJECT_MATCH",
      targetManagement: null,
    };
  }

  if (!candidate) {
    return {
      ...base,
      classification: "unknown_conflict",
      reasonCode: "TARGET_OBJECT_NOT_EXACTLY_REVIEWED",
      targetManagement: uniqueManagement(targetObjects),
    };
  }

  const candidateMatchesEntry = sameIdentity(candidate, entry);
  const matchingTarget = targetObjects.find(
    (target) =>
      target.management === candidate.management &&
      target.fingerprint === candidate.expectedTargetFingerprint,
  );
  if (!candidateMatchesEntry || targetObjects.length !== 1 || !matchingTarget) {
    return {
      ...base,
      classification: "unknown_conflict",
      reasonCode: "REVIEWED_CANDIDATE_IDENTITY_OR_FINGERPRINT_MISMATCH",
      targetManagement: uniqueManagement(targetObjects),
    };
  }

  return {
    ...base,
    classification:
      candidate.management === "bootstrap"
        ? "exact_bootstrap_duplicate_candidate"
        : "extension_managed_candidate",
    reasonCode: candidate.reasonCode,
    targetManagement: matchingTarget.management,
    targetFingerprint: matchingTarget.fingerprint,
    targetExtension: matchingTarget.extension ?? null,
  };
}

function parseInventory(inventoryText) {
  let inventory;
  try {
    inventory = JSON.parse(inventoryText);
  } catch {
    throw new Error("Inventory must be valid JSON.");
  }

  if (inventory.formatVersion !== 1) {
    throw new Error("Inventory formatVersion must be exactly 1.");
  }
  validateVersion(inventory.sourceVersion, "sourceVersion");
  validateVersion(inventory.targetVersion, "targetVersion");
  if (!Array.isArray(inventory.targetObjects)) {
    throw new Error("Inventory targetObjects must be an array.");
  }
  if (!Array.isArray(inventory.reviewedCandidates)) {
    throw new Error("Inventory reviewedCandidates must be an array.");
  }

  for (const target of inventory.targetObjects) {
    validateIdentity(target, "target object");
    if (!["application", "bootstrap", "extension", "unknown"].includes(target.management)) {
      throw new Error("Target object management is invalid.");
    }
    validateFingerprint(target.fingerprint, "target object fingerprint");
  }

  const candidateIds = new Set();
  for (const candidate of inventory.reviewedCandidates) {
    if (!candidate.archiveItemId || !/^\d+$/.test(candidate.archiveItemId)) {
      throw new Error("Every reviewed candidate requires an exact archive item ID; wildcard or schema-wide exclusions are forbidden.");
    }
    if (candidateIds.has(candidate.archiveItemId)) {
      throw new Error(`Duplicate reviewed archive item ID ${candidate.archiveItemId}.`);
    }
    candidateIds.add(candidate.archiveItemId);
    validateIdentity(candidate, "reviewed candidate");
    if (!["bootstrap", "extension"].includes(candidate.management)) {
      throw new Error("Reviewed candidates may only be bootstrap or extension managed.");
    }
    if (!/^[A-Z][A-Z0-9_]+$/.test(candidate.reasonCode ?? "")) {
      throw new Error("Every reviewed candidate requires a stable reason code.");
    }
    validateFingerprint(
      candidate.expectedTargetFingerprint,
      "expected target fingerprint",
    );
  }

  return inventory;
}

function validateVersion(version, label) {
  if (!Number.isInteger(version?.postgresMajor) || version.postgresMajor <= 0) {
    throw new Error(`${label}.postgresMajor must be a positive integer.`);
  }
  if (typeof version.supabaseImage !== "string" || !version.supabaseImage.trim()) {
    throw new Error(`${label}.supabaseImage is required.`);
  }
}

function validateIdentity(value, label) {
  for (const field of ["objectType", "name"]) {
    if (typeof value?.[field] !== "string" || !value[field].trim()) {
      throw new Error(`${label} requires an exact ${field}.`);
    }
  }
  if (value.schema !== null && (typeof value.schema !== "string" || !value.schema.trim())) {
    throw new Error(`${label} schema must be an exact string or null.`);
  }
  if ([value.schema, value.objectType, value.name].some(containsWildcard)) {
    throw new Error("Wildcard or schema-wide exclusions are forbidden.");
  }
}

function validateFingerprint(value, label) {
  if (!/^sha256:[a-f0-9]{64}$/.test(value ?? "")) {
    throw new Error(`${label} must be an exact SHA-256 fingerprint.`);
  }
}

function containsWildcard(value) {
  return typeof value === "string" && /[*?]|schema[-_ ]?wide/i.test(value);
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

function assertSanitizedInput(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} input must be a non-empty local text file.`);
  }
  if (/:\/\//.test(value) || /\b(?:password|access_token|refresh_token)\s*[:=]/i.test(value)) {
    throw new Error(`${label} input appears to contain a URL or credential material.`);
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
