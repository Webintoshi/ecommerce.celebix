import { CatalogExtraTypeChooser } from "@/components/catalog-admin/extras/CatalogExtraTypeChooser";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../../mira-catalog/catalog-fixture";

export default function ExtrasTypeFixturePage() {
  return <PanelLayoutClient model={MODEL}><CatalogExtraTypeChooser canManage /></PanelLayoutClient>;
}
