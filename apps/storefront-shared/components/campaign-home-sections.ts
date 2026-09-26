import type { CampaignHomeProjection } from "@celebix/saas-data";
import type {
  PublicStarterHomeSection,
  PublicStarterThemePresentationV2,
  PublicStarterThemePresentationV3,
} from "@celebix/saas-contracts";

type CampaignPresentation = PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3;
type ProductRowItems = CampaignHomeProjection["productRows"][number]["items"];

export function composeCampaignHomeSections(
  presentation: CampaignPresentation,
  designHeroActive: boolean,
): readonly PublicStarterHomeSection[] {
  const source = designHeroActive
    ? presentation.sections.filter((section) => section.kind !== "hero")
    : presentation.sections;
  const resolved: PublicStarterHomeSection[] = [];

  for (const section of source) {
    resolved.push(Object.freeze({ ...section }));
  }
  return Object.freeze(resolved);
}

export function campaignHomeSectionKey(section: PublicStarterHomeSection, index: number): string {
  return section.sectionId ?? (section.kind === "product_row" ? `home_${section.key}` : `home_${section.kind}_${index + 1}`);
}

export function homepageAvailableProducts<Product extends Readonly<{ available: boolean }> = ProductRowItems[number]>(products?: readonly Product[]): readonly Product[] {
  return Object.freeze((products ?? []).filter((product) => product.available));
}

export function visibleCampaignSectionKinds(projection: CampaignHomeProjection) {
  if (projection.presentation.schemaVersion !== 2 && projection.presentation.schemaVersion !== 3) return Object.freeze([]);
  const rows = new Map(projection.productRows.map((row) => [row.key, row.items]));
  return Object.freeze(projection.presentation.sections.flatMap((section) => {
    if (section.kind === "hero") return section.slides.length ? [section.kind] : [];
    if (section.kind === "category_grid") return section.items.length ? [section.kind] : [];
    if (section.kind === "product_row") return homepageAvailableProducts(rows.get(section.key)).length ? [section.kind] : [];
    if (section.kind === "split_campaign") return section.panels.length ? [section.kind] : [];
    if (section.kind === "value_propositions") return section.items.length ? [section.kind] : [];
    if (section.kind === "testimonials") return section.items.length ? [section.kind] : [];
    return section.heading && section.body ? [section.kind] : [];
  }));
}
