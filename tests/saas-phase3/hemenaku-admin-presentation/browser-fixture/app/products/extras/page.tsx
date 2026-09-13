import { CatalogResourceConsole } from "@/components/catalog-admin/CatalogResourceConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../mira-catalog/catalog-fixture";

export default function ExtrasFixturePage() {
  return <PanelLayoutClient model={MODEL}><CatalogResourceConsole kind="extra" canManage /></PanelLayoutClient>;
}
