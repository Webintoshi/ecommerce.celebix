import type { CampaignHomeProjection } from "@celebix/saas-data";

export function visibleCampaignSectionKinds(projection: CampaignHomeProjection) {
  const rows = new Map(projection.productRows.map((row) => [row.key, row.items]));
  return Object.freeze(projection.presentation.sections.flatMap((section) => {
    if (section.kind === "hero") return section.slides.length ? [section.kind] : [];
    if (section.kind === "category_grid") return section.items.length ? [section.kind] : [];
    if (section.kind === "product_row") return rows.get(section.key)?.length ? [section.kind] : [];
    if (section.kind === "split_campaign") return section.panels.length ? [section.kind] : [];
    return section.heading && section.body ? [section.kind] : [];
  }));
}
