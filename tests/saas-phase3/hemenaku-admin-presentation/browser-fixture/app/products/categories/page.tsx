import { CategoryManager } from "@/components/catalog-onboarding/CategoryManager";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../mira-catalog/catalog-fixture";

export default function CategoriesFixturePage() {
  return <PanelLayoutClient model={MODEL}><CategoryManager /></PanelLayoutClient>;
}
