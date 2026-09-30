import {
  normalizeStarterThemeCompositionV4,
  type HomepageSectionId,
  type StarterThemeCompositionConfigV4,
  type StarterThemeSectionConfigV4,
} from "@celebix/saas-contracts";

export type HomepageUndo = Readonly<{
  label: string;
  section: StarterThemeSectionConfigV4;
  index: number;
}>;

export class HomepageCommandError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "HomepageCommandError";
    this.code = code;
  }
}


function fail(code: string): never {
  throw new HomepageCommandError(code);
}

function sectionIndex(composition: StarterThemeCompositionConfigV4, sectionId: HomepageSectionId): number {
  const index = composition.sections.findIndex((section) => section.sectionId === sectionId);
  if (index < 0) fail("homepage_section_not_found");
  return index;
}

function normalize(composition: StarterThemeCompositionConfigV4, sections: readonly StarterThemeSectionConfigV4[]): StarterThemeCompositionConfigV4 {
  return Object.freeze({ ...composition, sections: Object.freeze(sections.map(section=>Object.freeze(section))) });
}

function createSafeSection(kind: StarterThemeSectionConfigV4["kind"], sectionId: HomepageSectionId): StarterThemeSectionConfigV4 {
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
    case "banner":
      return Object.freeze({ kind, sectionId, enabled: true, layout: "single", autoplay: false, presentation: "overlay", slides: Object.freeze([Object.freeze({ slideId: `slide_${sectionId}`, enabled: true, headline: "Yeni banner", body: "", desktopImage: null, mobileImage: null, destination: Object.freeze({ kind: "none" as const }) })]) });
  }
}

function ensureCanAdd(composition: StarterThemeCompositionConfigV4, kind: StarterThemeSectionConfigV4["kind"], sectionId: HomepageSectionId): void {
  if (composition.sections.some((section) => section.sectionId === sectionId)) fail("homepage_section_id_duplicate");
}

export function addHomepageSection(
  composition: StarterThemeCompositionConfigV4,
  kind: StarterThemeSectionConfigV4["kind"],
  sectionId: HomepageSectionId,
  insertAt = composition.sections.length,
): StarterThemeCompositionConfigV4 {
  ensureCanAdd(composition, kind, sectionId);
  if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt > composition.sections.length) fail("homepage_section_index_invalid");
  const sections = [...composition.sections];
  sections.splice(insertAt, 0, createSafeSection(kind, sectionId));
  return normalize(composition, sections);
}

export function duplicateHomepageSection(
  composition: StarterThemeCompositionConfigV4,
  sectionId: HomepageSectionId,
  nextId: HomepageSectionId,
): StarterThemeCompositionConfigV4 {
  const index = sectionIndex(composition, sectionId);
  const section = composition.sections[index]!;
  ensureCanAdd(composition, section.kind, nextId);
  const sections = [...composition.sections];
  const clone = structuredClone(section);
  sections.splice(index + 1, 0, Object.freeze({ ...clone, sectionId: nextId, ...(clone.kind === "banner" ? { slides: clone.slides.map((slide, index) => ({ ...slide, slideId: `slide_${nextId}_${index + 1}` })) } : {}) }) as StarterThemeSectionConfigV4);
  return normalize(composition, sections);
}

export function moveHomepageSection(
  composition: StarterThemeCompositionConfigV4,
  sectionId: HomepageSectionId,
  toIndex: number,
): StarterThemeCompositionConfigV4 {
  const fromIndex = sectionIndex(composition, sectionId);
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= composition.sections.length) fail("homepage_section_index_invalid");
  if (fromIndex === toIndex) return composition;
  const sections = [...composition.sections];
  const [section] = sections.splice(fromIndex, 1);
  sections.splice(toIndex, 0, section!);
  return normalize(composition, sections);
}

export function updateHomepageSection(
  composition: StarterThemeCompositionConfigV4,
  sectionId: HomepageSectionId,
  update: StarterThemeSectionConfigV4,
): StarterThemeCompositionConfigV4 {
  const index = sectionIndex(composition, sectionId);
  const current = composition.sections[index]!;
  if (update.kind !== current.kind) fail("homepage_section_kind_mismatch");
  if (update.sectionId !== sectionId) fail("homepage_section_id_immutable");
  const sections = [...composition.sections];
  sections[index] = update;
  return normalize(composition, sections);
}

export function setHomepageSectionVisibility(
  composition: StarterThemeCompositionConfigV4,
  sectionId: HomepageSectionId,
  enabled: boolean,
): StarterThemeCompositionConfigV4 {
  const index = sectionIndex(composition, sectionId);
  const sections = [...composition.sections];
  sections[index] = Object.freeze({ ...sections[index]!, enabled }) as StarterThemeSectionConfigV4;
  return normalize(composition, sections);
}

export function removeHomepageSection(
  composition: StarterThemeCompositionConfigV4,
  sectionId: HomepageSectionId,
): Readonly<{ composition: StarterThemeCompositionConfigV4; undo: HomepageUndo }> {
  const index = sectionIndex(composition, sectionId);
  const sections = composition.sections.filter((_, candidate) => candidate !== index);
  return Object.freeze({
    composition: normalize(composition, sections),
    undo: Object.freeze({ label: "Bölümü geri getir", section: composition.sections[index]!, index }),
  });
}

export function restoreRemovedHomepageSection(composition: StarterThemeCompositionConfigV4, undo: HomepageUndo): StarterThemeCompositionConfigV4 {
  ensureCanAdd(composition, undo.section.kind, undo.section.sectionId);
  const sections = [...composition.sections];
  sections.splice(Math.min(undo.index, sections.length), 0, undo.section);
  return normalize(composition, sections);
}
