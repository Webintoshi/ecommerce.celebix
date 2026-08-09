export type DesignWorkspaceArea = "site" | "home";

export type DesignWorkspaceStep =
  | "brand"
  | "style"
  | "navigation"
  | "product"
  | "cart"
  | "footer"
  | "hero"
  | "assets"
  | "sections"
  | "promotion";

export interface DesignWorkspaceLocation {
  readonly area: DesignWorkspaceArea;
  readonly step: DesignWorkspaceStep;
}

export interface DesignWorkspaceAreaItem {
  readonly key: DesignWorkspaceArea;
  readonly label: string;
  readonly hint: string;
  readonly selected: boolean;
}

export interface DesignWorkspaceStepItem {
  readonly key: DesignWorkspaceStep;
  readonly label: string;
  readonly hint: string;
  readonly selected: boolean;
}

const AREAS = Object.freeze([
  Object.freeze({ key: "site", label: "Tüm site", hint: "Her sayfada görünen alanlar" }),
  Object.freeze({ key: "home", label: "Ana sayfa", hint: "Vitrin ve ana sayfa bölümleri" }),
] as const);

const STEPS = Object.freeze({
  site: Object.freeze([
    Object.freeze({ key: "brand", label: "Marka", hint: "Logo ve mağaza kimliği" }),
    Object.freeze({ key: "style", label: "Renk ve yazı", hint: "Renkler, fontlar ve genel görünüm" }),
    Object.freeze({ key: "navigation", label: "Menü ve duyuru", hint: "Header düzeni ve duyuru şeridi" }),
    Object.freeze({ key: "product", label: "Ürün sayfası", hint: "Galeri ve satın alma alanı" }),
    Object.freeze({ key: "cart", label: "Sepet", hint: "Yan sepet ve güven mesajları" }),
    Object.freeze({ key: "footer", label: "Footer", hint: "Alt menü ve iletişim alanları" }),
  ]),
  home: Object.freeze([
    Object.freeze({ key: "hero", label: "Bannerlar", hint: "Ana sayfa bannerları" }),
    Object.freeze({ key: "assets", label: "Görseller", hint: "Banner ve kategori görselleri" }),
    Object.freeze({ key: "sections", label: "Bölümler", hint: "Ana sayfa içerik sırası" }),
    Object.freeze({ key: "promotion", label: "Promosyon", hint: "Zamanlı kampanya alanı" }),
  ]),
} as const);

const LEGACY_LOCATION = Object.freeze<Record<string, DesignWorkspaceLocation>>({
  theme: Object.freeze({ area: "site", step: "style" }),
  brand: Object.freeze({ area: "site", step: "brand" }),
  colors: Object.freeze({ area: "site", step: "style" }),
  typography: Object.freeze({ area: "site", step: "style" }),
  announcement: Object.freeze({ area: "site", step: "navigation" }),
  navigation: Object.freeze({ area: "site", step: "navigation" }),
  product: Object.freeze({ area: "site", step: "product" }),
  cart: Object.freeze({ area: "site", step: "cart" }),
  footer: Object.freeze({ area: "site", step: "footer" }),
  hero: Object.freeze({ area: "home", step: "hero" }),
  assets: Object.freeze({ area: "home", step: "assets" }),
  home: Object.freeze({ area: "home", step: "sections" }),
  sections: Object.freeze({ area: "home", step: "sections" }),
  promotion: Object.freeze({ area: "home", step: "promotion" }),
});

const DEFAULT_LOCATION = Object.freeze<DesignWorkspaceLocation>({ area: "site", step: "brand" });

export function resolveDesignWorkspaceLocation(section?: string | null): DesignWorkspaceLocation {
  return LEGACY_LOCATION[section ?? ""] ?? DEFAULT_LOCATION;
}

export function designWorkspaceAreas(activeArea: DesignWorkspaceArea): readonly DesignWorkspaceAreaItem[] {
  return Object.freeze(AREAS.map((area) => Object.freeze({ ...area, selected: area.key === activeArea })));
}

export function designWorkspaceSteps(area: DesignWorkspaceArea, activeStep: DesignWorkspaceStep): readonly DesignWorkspaceStepItem[] {
  return Object.freeze(STEPS[area].map((step) => Object.freeze({ ...step, selected: step.key === activeStep })));
}

export function defaultStepForDesignArea(area: DesignWorkspaceArea): DesignWorkspaceStep {
  return STEPS[area][0].key;
}
