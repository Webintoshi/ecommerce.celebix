import type { StorefrontDesignDocument, StorefrontDesignDraftMutation, StorefrontDesignWorkspace } from "@celebix/saas-contracts";
import type { HomepageUndo } from "./homepage-command-model.ts";

export type DesignEditorStatus = "saved" | "dirty" | "saving" | "publishing" | "error" | "conflict";
export type DesignEditorState = Readonly<{ design: StorefrontDesignDocument; draftVersion: number; publishedVersion: number; revision: number; savedRevision: number; status: DesignEditorStatus; homepageUndo?: HomepageUndo }>;
export type DesignSaveToken = Readonly<{ revision: number; design: StorefrontDesignDocument }>;

export function createDesignEditorState(workspace: Pick<StorefrontDesignWorkspace, "draft" | "draftVersion" | "publishedVersion">): DesignEditorState {
  return Object.freeze({ design: workspace.draft, draftVersion: workspace.draftVersion, publishedVersion: workspace.publishedVersion, revision: 0, savedRevision: 0, status: "saved" });
}

export function applyDesignEdit(state: DesignEditorState, design: StorefrontDesignDocument, homepageUndo?: HomepageUndo): DesignEditorState {
  return Object.freeze({ ...state, design, revision: state.revision + 1, status: "dirty" as const, ...(homepageUndo ? { homepageUndo } : {}) });
}

export function clearHomepageUndo(state: DesignEditorState): DesignEditorState {
  const { homepageUndo: _homepageUndo, ...rest } = state;
  return Object.freeze(rest);
}

export function beginDesignSave(state: DesignEditorState): Readonly<{ state: DesignEditorState; token: DesignSaveToken }> {
  return Object.freeze({ state: Object.freeze({ ...state, status: "saving" as const }), token: Object.freeze({ revision: state.revision, design: state.design }) });
}

export function completeDesignSave(state: DesignEditorState, token: DesignSaveToken, mutation: StorefrontDesignDraftMutation): DesignEditorState {
  return Object.freeze({ ...state, draftVersion: mutation.draftVersion, savedRevision: Math.max(state.savedRevision, token.revision), status: state.revision === token.revision ? "saved" as const : "dirty" as const });
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  brand: "Marka", hero: "Banner", promotion: "Kampanya", announcement: "Duyuru", typography: "Yazı biçimi", composition: "Tema",
  primaryColor: "Ana renk", accentColor: "Vurgu rengi", backgroundColor: "Arka plan", textColor: "Metin rengi", logo: "Logo", favicon: "Sekme simgesi", fontFamily: "Yazı tipi",
  headline: "Başlık", heading: "Başlık", body: "Açıklama", enabled: "Görünürlük", slides: "Slaytlar", desktopImage: "Masaüstü görseli", mobileImage: "Mobil görseli", destination: "Bağlantı", items: "Öğeler", startsAt: "Başlangıç", endsAt: "Bitiş",
  sections: "Bölümler", sectionId: "Bölüm kimliği", kind: "Tür", mediaId: "Görsel kimliği", url: "Adres", altText: "Görsel açıklaması", path: "Sayfa", source: "Kaynak", limit: "Adet", icon: "Simge", speed: "Hız", direction: "Yön", animation: "Hareket",
  visual: "Görünüm", navigation: "Menü", productDetail: "Ürün sayfası", cart: "Sepet", footer: "Alt alan", groups: "Gruplar", links: "Bağlantılar", newsletter: "Bülten", social: "Sosyal medya", tone: "Renk tonu", consentLabel: "Onay metni",
  headingFont: "Başlık yazısı", bodyFont: "Metin yazısı", family: "Yazı ailesi", category: "Kategori", availableWeights: "Yazı kalınlıkları", headingWeight: "Başlık kalınlığı", bodyWeight: "Metin kalınlığı", headingSizePx: "Başlık boyutu", bodySizePx: "Metin boyutu",
  schemaVersion: "Biçim sürümü", colorScheme: "Renk düzeni", headingStyle: "Başlık stili", cornerStyle: "Köşe stili", headerStyle: "Üst alan stili", headerWidth: "Üst alan genişliği", headerLayout: "Üst alan yerleşimi", productCardStyle: "Ürün kartı", productImageRatio: "Ürün görsel oranı", sectionSpacing: "Bölüm aralığı",
  rootCategoryIds: "Menü kategorileri", categoryIds: "Kategoriler", productIds: "Ürünler", productId: "Ürün", categoryId: "Kategori", pageId: "Sayfa", galleryStyle: "Galeri", showSku: "Stok kodu", showBrand: "Marka adı", showBreadcrumbs: "Gezinme yolu", showRelatedProducts: "İlgili ürünler", showApprovedReviews: "Onaylı yorumlar", mobileStickyPurchase: "Mobil satın alma alanı", showSizeGuide: "Beden rehberi", informationSections: "Bilgi bölümleri", showCheckoutReadiness: "Ödeme durumu", showShippingProgress: "Kargo ilerlemesi", showQuantitySelector: "Adet seçimi", trustMessage: "Güven mesajı",
};

export function compareDesignDrafts(local: StorefrontDesignDocument, remote: StorefrontDesignDocument): readonly Readonly<{ field: string; local: string; remote: string }>[] {
  const rows: { field: string; local: string; remote: string }[] = [];
  const display = (value: unknown): string => value === undefined || value === null ? "Boş" : value === true ? "Açık" : value === false ? "Kapalı" : String(value);
  function visit(left: unknown, right: unknown, path: readonly string[]) {
    if (Object.is(left, right)) return;
    if (Array.isArray(left) || Array.isArray(right)) {
      const a: readonly unknown[] = Array.isArray(left) ? left : [], b: readonly unknown[] = Array.isArray(right) ? right : [];
      for (let index = 0; index < Math.max(a.length, b.length); index += 1) visit(a[index], b[index], [...path, `${index + 1}. öğe`]);
      return;
    }
    if ((typeof left === "object" && left !== null) || (typeof right === "object" && right !== null)) {
      const a = new Map<string, unknown>(typeof left === "object" && left !== null ? Object.entries(left) : []);
      const b = new Map<string, unknown>(typeof right === "object" && right !== null ? Object.entries(right) : []);
      for (const key of new Set([...a.keys(), ...b.keys()])) visit(a.get(key), b.get(key), [...path, FIELD_LABELS[key] ?? key]);
      return;
    }
    rows.push({ field: path.join(" · "), local: display(left), remote: display(right) });
  }
  visit(local, remote, []);
  return rows;
}
