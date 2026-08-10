import type { CampaignHomeProjection } from "@celebix/saas-data";
import type {
  PublicStarterHomeSection,
  PublicStarterThemePresentationV2,
  PublicStarterThemePresentationV3,
} from "@celebix/saas-contracts";

type CampaignPresentation = PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3;

function categoryShowcaseSection(presentation: CampaignPresentation): Extract<PublicStarterHomeSection, { kind: "category_grid" }> | null {
  const showcase = presentation.categoryShowcase;
  if (!showcase) return null;
  return Object.freeze({
    kind: "category_grid",
    heading: showcase.heading,
    layout: showcase.layout,
    items: Object.freeze(showcase.items.map(({ name, slug, image }) => Object.freeze({ name, slug, image }))),
  });
}

export function composeCampaignHomeSections(
  presentation: CampaignPresentation,
  designHeroActive: boolean,
): readonly PublicStarterHomeSection[] {
  const source = designHeroActive
    ? presentation.sections.filter((section) => section.kind !== "hero")
    : presentation.sections;
  const category = categoryShowcaseSection(presentation);
  const resolved: PublicStarterHomeSection[] = [];
  let categoryMounted = false;

  for (const section of source) {
    if (section.kind === "category_grid") {
      if (category && !categoryMounted) {
        resolved.push(category);
        categoryMounted = true;
      }
      continue;
    }
    if (category && !categoryMounted && (section.kind === "value_propositions" || section.kind === "testimonials")) {
      resolved.push(category);
      categoryMounted = true;
    }
    resolved.push(section);
  }
  if (category && !categoryMounted) resolved.push(category);
  return Object.freeze(resolved);
}

export function visibleCampaignSectionKinds(projection: CampaignHomeProjection) {
  if (projection.presentation.schemaVersion !== 2 && projection.presentation.schemaVersion !== 3) return Object.freeze([]);
  const rows = new Map(projection.productRows.map((row) => [row.key, row.items]));
  return Object.freeze(projection.presentation.sections.flatMap((section) => {
    if (section.kind === "hero") return section.slides.length ? [section.kind] : [];
    if (section.kind === "category_grid") return section.items.length ? [section.kind] : [];
    if (section.kind === "product_row") return rows.get(section.key)?.length ? [section.kind] : [];
    if (section.kind === "split_campaign") return section.panels.length ? [section.kind] : [];
    if (section.kind === "value_propositions") return section.items.length ? [section.kind] : [];
    if (section.kind === "testimonials") return section.items.length ? [section.kind] : [];
    return section.heading && section.body ? [section.kind] : [];
  }));
}
