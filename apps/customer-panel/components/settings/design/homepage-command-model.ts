import {
  normalizeStarterThemeCompositionV3,
  type HomepageSectionId,
  type StarterThemeCompositionConfigV3,
  type StarterThemeSectionConfigV3,
} from "@celebix/saas-contracts";

export type HomepageUndo = Readonly<{
  label: string;
  composition: StarterThemeCompositionConfigV3;
}>;

export class HomepageCommandError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "HomepageCommandError";
    this.code = code;
  }
}

const BODY_SECTION_LIMIT = 12;
const PRODUCT_ROW_LIMIT = 4;

function fail(code: string): never {
  throw new HomepageCommandError(code);
}

function sectionIndex(composition: StarterThemeCompositionConfigV3, sectionId: HomepageSectionId): number {
  const index = composition.sections.findIndex((section) => section.sectionId === sectionId);
  if (index < 0) fail("homepage_section_not_found");
  return index;
}

function normalize(composition: StarterThemeCompositionConfigV3, sections: readonly StarterThemeSectionConfigV3[]): StarterThemeCompositionConfigV3 {
  return normalizeStarterThemeCompositionV3({ ...composition, sections: Object.freeze(sections) });
}

function createSafeSection(kind: StarterThemeSectionConfigV3["kind"], sectionId: HomepageSectionId): StarterThemeSectionConfigV3 {
  switch (kind) {
    case "category_grid":
      return Object.freeze({ kind, sectionId, enabled: true, heading: "Kategorileri keşfedin", categoryIds: Object.freeze([]), layout: "grid" });
    case "product_row":
      return Object.freeze({ kind, sectionId, enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 });
    case "split_campaign":
      return Object.freeze({ kind, sectionId, enabled: true, panels: Object.freeze([]) });
    case "brand_story":
      return Object.freeze({ kind, sectionId, enabled: true, eyebrow: "Hikâyemiz", heading: "Markamızı keşfedin", body: "Mağazanızın hikâyesini müşterilerinize anlatın." });
    case "value_propositions":
      return Object.freeze({
        kind,
        sectionId,
        enabled: true,
        items: Object.freeze([
          Object.freeze({ icon: "shield" as const, heading: "Güvenli alışveriş", body: "Siparişiniz güvenle hazırlanır." }),
          Object.freeze({ icon: "truck" as const, heading: "Özenli teslimat", body: "Ürünleriniz özenle paketlenir." }),
        ]),
      });
    case "testimonials":
      return Object.freeze({ kind, sectionId, enabled: true, heading: "Müşterilerimiz ne diyor?", source: "approved_product_reviews", limit: 3, minimumRating: 5 });
    case "hero":
      return fail("homepage_section_kind_fixed");
  }
}

function ensureCanAdd(composition: StarterThemeCompositionConfigV3, kind: StarterThemeSectionConfigV3["kind"], sectionId: HomepageSectionId): void {
  if (kind === "hero") fail("homepage_section_kind_fixed");
  if (composition.sections.length >= BODY_SECTION_LIMIT) fail("homepage_section_total_limit");
  if (composition.sections.some((section) => section.sectionId === sectionId)) fail("homepage_section_id_duplicate");
  if (kind === "product_row") {
    if (composition.sections.filter((section) => section.kind === "product_row").length >= PRODUCT_ROW_LIMIT) fail("homepage_product_row_limit");
    return;
  }
  if (composition.sections.some((section) => section.kind === kind)) fail("homepage_section_singleton_exists");
}

export function addHomepageSection(
  composition: StarterThemeCompositionConfigV3,
  kind: StarterThemeSectionConfigV3["kind"],
  sectionId: HomepageSectionId,
  insertAt = composition.sections.length,
): StarterThemeCompositionConfigV3 {
  ensureCanAdd(composition, kind, sectionId);
  if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt > composition.sections.length) fail("homepage_section_index_invalid");
  const sections = [...composition.sections];
  sections.splice(insertAt, 0, createSafeSection(kind, sectionId));
  return normalize(composition, sections);
}

export function duplicateHomepageSection(
  composition: StarterThemeCompositionConfigV3,
  sectionId: HomepageSectionId,
  nextId: HomepageSectionId,
): StarterThemeCompositionConfigV3 {
  const index = sectionIndex(composition, sectionId);
  const section = composition.sections[index]!;
  if (section.kind !== "product_row") fail("homepage_section_not_repeatable");
  ensureCanAdd(composition, section.kind, nextId);
  const sections = [...composition.sections];
  sections.splice(index + 1, 0, Object.freeze({ ...section, sectionId: nextId }));
  return normalize(composition, sections);
}

export function moveHomepageSection(
  composition: StarterThemeCompositionConfigV3,
  sectionId: HomepageSectionId,
  toIndex: number,
): StarterThemeCompositionConfigV3 {
  const fromIndex = sectionIndex(composition, sectionId);
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= composition.sections.length) fail("homepage_section_index_invalid");
  if (fromIndex === toIndex) return composition;
  const sections = [...composition.sections];
  const [section] = sections.splice(fromIndex, 1);
  sections.splice(toIndex, 0, section!);
  return normalize(composition, sections);
}

export function updateHomepageSection(
  composition: StarterThemeCompositionConfigV3,
  sectionId: HomepageSectionId,
  update: StarterThemeSectionConfigV3,
): StarterThemeCompositionConfigV3 {
  const index = sectionIndex(composition, sectionId);
  const current = composition.sections[index]!;
  if (update.kind !== current.kind) fail("homepage_section_kind_mismatch");
  if (update.sectionId !== sectionId) fail("homepage_section_id_immutable");
  const sections = [...composition.sections];
  sections[index] = update;
  return normalize(composition, sections);
}

export function setHomepageSectionVisibility(
  composition: StarterThemeCompositionConfigV3,
  sectionId: HomepageSectionId,
  enabled: boolean,
): StarterThemeCompositionConfigV3 {
  const index = sectionIndex(composition, sectionId);
  const sections = [...composition.sections];
  sections[index] = Object.freeze({ ...sections[index]!, enabled }) as StarterThemeSectionConfigV3;
  return normalize(composition, sections);
}

export function removeHomepageSection(
  composition: StarterThemeCompositionConfigV3,
  sectionId: HomepageSectionId,
): Readonly<{ composition: StarterThemeCompositionConfigV3; undo: HomepageUndo }> {
  const index = sectionIndex(composition, sectionId);
  const sections = composition.sections.filter((_, candidate) => candidate !== index);
  return Object.freeze({
    composition: normalize(composition, sections),
    undo: Object.freeze({ label: "Bölümü geri getir", composition }),
  });
}

export function restoreRemovedHomepageSection(undo: HomepageUndo): StarterThemeCompositionConfigV3 {
  return normalizeStarterThemeCompositionV3(undo.composition);
}
