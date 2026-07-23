"use client";

import { CatalogImportPreparationConsole } from "./CatalogImportPreparationConsole";

export function CatalogBulkImportConsole({ canImport }: { canImport: boolean }) {
  return <CatalogImportPreparationConsole format="native_csv" title="Toplu Yükle" description="Yerel CSV dosyanızı doğrulayın, kalıcı önizlemeyi inceleyin ve ayrı bir onayla kataloğa aktarın." canImport={canImport} />;
}
