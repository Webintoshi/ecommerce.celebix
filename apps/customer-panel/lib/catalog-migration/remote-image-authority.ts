import { isPublicCatalogFeedAddress, validateCatalogFeedUrl } from "../catalog-import/feed-authority.ts";

function invalid(): never { throw new Error("migration_image_url_invalid"); }

export function validateMigrationImageUrl(value: unknown): string {
  try { return validateCatalogFeedUrl(value); } catch { return invalid(); }
}

export function isPublicMigrationImageAddress(value: string): boolean {
  return isPublicCatalogFeedAddress(value);
}
