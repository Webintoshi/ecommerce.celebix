import { ProductReviewConsole } from "@/components/catalog-admin/ProductReviewConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../mira-catalog/catalog-fixture";

export default function ReviewsFixturePage() {
  return <PanelLayoutClient model={MODEL}><ProductReviewConsole canModerate /></PanelLayoutClient>;
}
