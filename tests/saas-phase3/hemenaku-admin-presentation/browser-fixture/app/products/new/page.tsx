import { ProductCreateForm } from "@/components/catalog/ProductCreateForm";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../mira-catalog/catalog-fixture";

export default function ProductCreateFixturePage() {
  return <PanelLayoutClient model={MODEL}><ProductCreateForm /></PanelLayoutClient>;
}
