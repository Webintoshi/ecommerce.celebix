import { ProductListConsole } from "@/components/catalog/ProductListConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../mira-catalog/catalog-fixture";

export default function ProductFixturePage() {
  return <PanelLayoutClient model={MODEL}><ProductListConsole canManage canArchive canImport /></PanelLayoutClient>;
}
