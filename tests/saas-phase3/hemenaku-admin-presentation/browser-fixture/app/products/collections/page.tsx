import { CatalogResourceConsole } from "@/components/catalog-admin/CatalogResourceConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../mira-catalog/catalog-fixture";

export default function CollectionsFixturePage() {
  return <PanelLayoutClient model={MODEL}><CatalogResourceConsole kind="collection" canManage /></PanelLayoutClient>;
}
