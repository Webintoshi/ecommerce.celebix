import type { StoreId } from "@celebix/saas-contracts";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const NAMESPACE_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,127}$/;

function assertSegment(value: string, field: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value !== value.toLowerCase() ||
    value.includes("..") ||
    value.includes(":") ||
    value.includes("/") ||
    value.includes("\\") ||
    CONTROL_CHARACTERS.test(value) ||
    !NAMESPACE_SEGMENT.test(value)
  ) {
    throw new TypeError(`${field} must be a normalized namespace segment.`);
  }

  return value;
}

function assertVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new TypeError("Namespace version must be a positive integer.");
  }
  return version;
}

export function assertStoreNamespace(storeId: StoreId): StoreId {
  return assertSegment(storeId, "Store ID");
}

export function buildStoreObjectKey(
  storeId: StoreId,
  kind: string,
  objectName: string,
): string {
  const normalizedStoreId = assertStoreNamespace(storeId);
  const normalizedKind = assertSegment(kind, "Object kind");

  if (
    typeof objectName !== "string" ||
    objectName.length === 0 ||
    objectName.length > 512 ||
    objectName.startsWith("/") ||
    objectName.startsWith("stores/") ||
    objectName.includes("..") ||
    objectName.includes("\\") ||
    objectName.includes("%") ||
    CONTROL_CHARACTERS.test(objectName)
  ) {
    throw new TypeError("Object name contains unsafe path syntax.");
  }

  const normalizedObjectName = objectName
    .split("/")
    .map((segment) => assertSegment(segment, "Object name"))
    .join("/");

  return `stores/${normalizedStoreId}/${normalizedKind}/${normalizedObjectName}`;
}

export function buildStoreCacheKey(
  storeId: StoreId,
  subsystem: string,
  key: string,
  version: number,
): string {
  return `celebix:${assertStoreNamespace(storeId)}:${assertSegment(subsystem, "Cache subsystem")}:${assertSegment(key, "Cache key")}:v${assertVersion(version)}`;
}

export function buildStoreCacheTag(
  storeId: StoreId,
  resource: string,
  version: number,
): string {
  return `store:${assertStoreNamespace(storeId)}:${assertSegment(resource, "Cache resource")}:${assertVersion(version)}`;
}

export function buildStoreJobKey(storeId: StoreId, kind: string, key: string): string {
  return `store:${assertStoreNamespace(storeId)}:job:${assertSegment(kind, "Job kind")}:${assertSegment(key, "Job key")}`;
}
