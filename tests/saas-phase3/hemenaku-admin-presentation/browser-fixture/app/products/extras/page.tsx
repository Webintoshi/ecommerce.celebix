import { CatalogExtrasConsole } from "@/components/catalog-admin/extras/CatalogExtrasConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../mira-catalog/catalog-fixture";

export default async function ExtrasFixturePage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = await searchParams;
  return <PanelLayoutClient model={MODEL}><CatalogExtrasConsole canManage={query.state !== "read-only"} /></PanelLayoutClient>;
}
