import { ProductCreateForm } from "@/components/catalog/ProductCreateForm";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../mira-catalog/catalog-fixture";

export default async function ProductCreateFixturePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <PanelLayoutClient model={MODEL}><ProductCreateForm initialMode={mode === "quick" || mode === "advanced" ? mode : "choose"} /></PanelLayoutClient>;
}
