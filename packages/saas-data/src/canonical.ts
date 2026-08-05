import { createHash } from "node:crypto";

import type { CreateStarterTenantInput } from "@celebix/saas-contracts";

import type { CanonicalTenantFingerprint, PrincipalIdentityKey } from "./types.ts";

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
    .join(",")}}`;
}

export function canonicalCreateStarterTenantInput(input: CreateStarterTenantInput): string {
  return stableSerialize({
    schemaVersion: input.schemaVersion,
    principal: input.principal,
    store: input.store,
    consents: input.consents,
    requestedAt: input.requestedAt,
  });
}

export function createCanonicalTenantFingerprint(
  input: CreateStarterTenantInput,
): CanonicalTenantFingerprint {
  return createHash("sha256")
    .update(canonicalCreateStarterTenantInput(input), "utf8")
    .digest("hex") as CanonicalTenantFingerprint;
}

export function createPrincipalIdentityKey(issuer: string, subject: string): PrincipalIdentityKey {
  return createHash("sha256")
    .update(stableSerialize({ issuer, subject }), "utf8")
    .digest("hex") as PrincipalIdentityKey;
}

export function assertNormalizedSlug(value: string): string {
  if (value.length < 3 || value.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new TypeError("Slug must already be normalized");
  }

  return value;
}

export function assertNormalizedExactHostname(value: string): string {
  const labels = value.split(".");
  const validLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (
    value.length > 253 ||
    labels.length < 2 ||
    value !== value.toLowerCase() ||
    value.includes("*") ||
    labels.some((label) => !validLabel.test(label))
  ) {
    throw new TypeError("Hostname must be normalized and exact");
  }

  return value;
}
