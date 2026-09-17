import { CatalogResourceConsole } from "@/components/catalog-admin/CatalogResourceConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../mira-catalog/catalog-fixture";

export default function BrandsFixturePage() {
  return <PanelLayoutClient model={MODEL}><CatalogResourceConsole kind="brand" canManage /></PanelLayoutClient>;
}
