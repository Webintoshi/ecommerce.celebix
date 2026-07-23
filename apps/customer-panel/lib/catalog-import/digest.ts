import type { CatalogImportFormat } from "@celebix/saas-contracts";
import { createHash } from "node:crypto";

export function digestCatalogImport(format: CatalogImportFormat, content: string): string {
  return createHash("sha256").update(format).update("\0").update(content, "utf8").digest("hex");
}
