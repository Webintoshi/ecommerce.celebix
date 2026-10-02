import type { StorefrontDesignDocument, StorefrontDesignApplyMutation, StorefrontDesignEditorMediaOption, StorefrontDesignAssetOption, StorefrontDesignDestinationOption, StorefrontDesignMediaOption, StarterSocialNetwork } from "@celebix/saas-contracts";
import type { HomepageUndo } from "./homepage-command-model.ts";
import { designPathLabel } from "./design-link-options.ts";
import { socialProfileAccount } from "../starter-footer-social.ts";
import { STARTER_FOOTER_POLICIES } from "../starter-footer-options.ts";

export type DesignEditorStatus = "applied" | "dirty" | "applying" | "error" | "conflict";
export type DesignApplyToken = Readonly<{ revision: number; design: StorefrontDesignDocument; expectedPublishedVersion: number; operationId: string }>;
export type DesignEditorState = Readonly<{ baseline: StorefrontDesignDocument; design: StorefrontDesignDocument; publishedVersion: number; revision: number; status: DesignEditorStatus; pending?: DesignApplyToken; homepageUndo?: HomepageUndo }>;
export function editorAssetOptions(media:readonly StorefrontDesignEditorMediaOption[]):readonly StorefrontDesignAssetOption[] {
 return media.flatMap(option=>option.reference.kind==="asset"&&option.assetKind?[{id:option.reference.assetId,kind:option.assetKind,url:option.url,altText:option.altText,mediaType:option.mediaType,width:option.width,height:option.height}]:[]);
}
export function createDesignEditorState(workspace: Readonly<{design:StorefrontDesignDocument;publishedVersion:number}>): DesignEditorState {
 return Object.freeze({baseline:workspace.design,design:workspace.design,publishedVersion:workspace.publishedVersion,revision:0,status:"applied"});
}
export function applyDesignEdit(state:DesignEditorState, design:StorefrontDesignDocument, homepageUndo?:HomepageUndo):DesignEditorState {
 if(JSON.stringify(state.design)===JSON.stringify(design))return state;
 const {pending:_pending,...rest}=state;
 return Object.freeze({...rest,design,revision:state.revision+1,status:"dirty",...(homepageUndo?{homepageUndo}:{})});
}
export function cancelDesignEdit(state:DesignEditorState):DesignEditorState {return createDesignEditorState({design:state.baseline,publishedVersion:state.publishedVersion});}
export function clearHomepageUndo(state:DesignEditorState):DesignEditorState {const {homepageUndo:_undo,...rest}=state;return Object.freeze(rest);}
export function beginDesignApply(state:DesignEditorState,operationId:string):Readonly<{state:DesignEditorState;token:DesignApplyToken}> {
 const token=state.pending??Object.freeze({revision:state.revision,design:state.design,expectedPublishedVersion:state.publishedVersion,operationId});
 return Object.freeze({state:Object.freeze({...state,status:"applying",pending:token}),token});
}
export function failDesignApply(state:DesignEditorState,status:"error"|"conflict"):DesignEditorState {return Object.freeze({...state,status});}
export function completeDesignApply(state:DesignEditorState,token:DesignApplyToken,mutation:StorefrontDesignApplyMutation):DesignEditorState {
 if(state.revision!==token.revision)return Object.freeze({...state,baseline:mutation.design,publishedVersion:mutation.publishedVersion,status:"dirty",pending:undefined});
 return createDesignEditorState({design:mutation.design,publishedVersion:mutation.publishedVersion});
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  brand: "Marka", hero: "Banner", promotion: "Kampanya", announcement: "Duyuru", typography: "Yazı biçimi", composition: "Tema",
  primaryColor: "Ana renk", accentColor: "Vurgu rengi", backgroundColor: "Arka plan", textColor: "Metin rengi", logo: "Logo", favicon: "Sekme simgesi", fontFamily: "Yazı tipi",
  headline: "Başlık", heading: "Başlık", body: "Açıklama", enabled: "Görünürlük", slides: "Slaytlar", desktopImage: "Masaüstü görseli", mobileImage: "Mobil görseli", destination: "Bağlantı", items: "Öğeler", startsAt: "Başlangıç", endsAt: "Bitiş",
  sections: "Bölümler", sectionId: "Bölüm", slideId: "Görsel", kind: "Tür", mediaId: "Görsel", assetId: "Görsel", desktopAssetId: "Masaüstü görseli", mobileAssetId: "Mobil görseli", resourceId: "Bağlantı", url: "Seçim", altText: "Görsel açıklaması", path: "Bağlantı", source: "Kaynak", limit: "Adet", icon: "Simge", speed: "Hız", direction: "Yön", animation: "Hareket",
  visual: "Görünüm", navigation: "Menü", productDetail: "Ürün sayfası", cart: "Sepet", footer: "Alt alan", groups: "Gruplar", links: "Bağlantılar", newsletter: "Bülten", social: "Sosyal medya", tone: "Renk tonu", consentLabel: "Onay metni",
  headingFont: "Başlık yazısı", bodyFont: "Metin yazısı", family: "Yazı ailesi", category: "Kategori", availableWeights: "Yazı kalınlıkları", headingWeight: "Başlık kalınlığı", bodyWeight: "Metin kalınlığı", headingSizePx: "Başlık boyutu", bodySizePx: "Metin boyutu",
  schemaVersion: "Biçim sürümü", colorScheme: "Renk düzeni", headingStyle: "Başlık stili", cornerStyle: "Köşe stili", headerStyle: "Üst alan stili", headerWidth: "Üst alan genişliği", headerLayout: "Üst alan yerleşimi", productCardStyle: "Ürün kartı", productImageRatio: "Ürün görsel oranı", sectionSpacing: "Bölüm aralığı",
  rootCategoryIds: "Menü kategorileri", categoryIds: "Kategoriler", productIds: "Ürünler", productId: "Ürün", categoryId: "Kategori", pageId: "Sayfa", galleryStyle: "Galeri", showSku: "Stok kodu", showBrand: "Marka adı", showBreadcrumbs: "Gezinme yolu", showRelatedProducts: "İlgili ürünler", showApprovedReviews: "Onaylı yorumlar", mobileStickyPurchase: "Mobil satın alma alanı", showSizeGuide: "Beden rehberi", informationSections: "Bilgi bölümleri", showCheckoutReadiness: "Ödeme durumu", showShippingProgress: "Kargo ilerlemesi", showQuantitySelector: "Adet seçimi", trustMessage: "Güven mesajı",
};

type DesignComparisonResources = Readonly<{
  destinations: readonly StorefrontDesignDestinationOption[];
  media: readonly StorefrontDesignMediaOption[];
}>;

export function compareDesignDrafts(local: StorefrontDesignDocument, remote: StorefrontDesignDocument, resources?: Readonly<{ local: DesignComparisonResources; remote: DesignComparisonResources }>): readonly Readonly<{ field: string; local: string; remote: string }>[] {
  const rows: { field: string; local: string; remote: string }[] = [];
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
  const isReference = (value: unknown) => isRecord(value) && typeof value.kind === "string" && ["none", "media", "asset", "legacy_https", "path", "product", "collection", "catalog_collection", "page", "category", "fixed_policy", "system"].includes(value.kind);
  const imageLabel = (value: string, options?: DesignComparisonResources) => options?.media.find(item => item.id === value || item.url === value)?.altText || "Görsel seçildi";
  const resourceLabel = (kind: string, value: string, options?: DesignComparisonResources) => options?.destinations.find(item => item.resourceId === value && (kind === "category" ? item.kind === "collection" : item.kind === kind))?.label ?? `${kind === "product" ? "Ürün" : kind === "collection" || kind === "category" ? "Kategori" : kind === "catalog_collection" ? "Koleksiyon" : "Sayfa"} seçildi`;
  function display(value: unknown, keys: readonly string[], options?: DesignComparisonResources, parent?: Record<string, unknown>): string {
    if (value === undefined || value === null || value === "") return "Boş";
    if (value === true) return "Açık";
    if (value === false) return "Kapalı";
    if (isRecord(value)) {
      if (value.kind === "none") return "Bağlantı yok";
      if (typeof value.mediaId === "string" || typeof value.assetId === "string") return imageLabel(String(value.mediaId ?? value.assetId), options);
      if (value.kind === "legacy_https" && typeof value.url === "string") return imageLabel(value.url, options);
      if (value.kind === "path" && typeof value.path === "string") return designPathLabel(value.path, options?.destinations ?? []);
      if (value.kind === "system" && typeof value.destination === "string") return designPathLabel(value.destination, options?.destinations ?? []);
      if (value.kind === "fixed_policy") return STARTER_FOOTER_POLICIES.find(([key]) => key === value.policyKey)?.[1] ?? "Politika seçildi";
      const id = value.resourceId ?? value.categoryId ?? value.pageId;
      if (typeof id === "string") return resourceLabel(String(value.kind), id, options);
    }
    const key = [...keys].reverse().find(item => !/^\d+$/.test(item));
    if (typeof value === "string") {
      if (key === "destination" || key === "path") return designPathLabel(value, options?.destinations ?? []);
      if (key === "url" && keys.includes("social")) return socialProfileAccount(parent?.network as StarterSocialNetwork, value);
      if (key === "url" || key === "mediaId" || key?.endsWith("AssetId") || key === "assetId") return imageLabel(value, options);
      if (key === "resourceId") return resourceLabel(String(parent?.kind), value, options);
      if (key === "categoryId" || key === "categoryIds" || key === "rootCategoryIds") return resourceLabel("category", value, options);
      if (key === "productId" || key === "productIds") return resourceLabel("product", value, options);
      if (key === "pageId") return resourceLabel("page", value, options);
      if (key === "sectionId") return "Bölüm seçildi";
      if (key === "slideId") return "Görsel seçildi";
    }
    return String(value);
  }
  function row(left: unknown, right: unknown, path: readonly string[], keys: readonly string[], parentLeft?: Record<string, unknown>, parentRight?: Record<string, unknown>) {
    let localValue = display(left, keys, resources?.local, parentLeft), remoteValue = display(right, keys, resources?.remote, parentRight);
    // Opaque references still need an explicit difference when both names are unavailable or identical.
    if (localValue === remoteValue) {
      localValue += " (bu çalışma)";
      remoteValue += " (güncel sürüm)";
    }
    rows.push({ field: path.join(" · "), local: localValue, remote: remoteValue });
  }
  function visit(left: unknown, right: unknown, path: readonly string[], keys: readonly string[], parentLeft?: Record<string, unknown>, parentRight?: Record<string, unknown>) {
    if (Object.is(left, right)) return;
    if (isReference(left) || isReference(right)) {
      if (isRecord(left) && isRecord(right) && Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.is(left[key], right[key]))) return;
      row(left, right, path, keys, parentLeft, parentRight);
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      const a: readonly unknown[] = Array.isArray(left) ? left : [], b: readonly unknown[] = Array.isArray(right) ? right : [];
      for (let index = 0; index < Math.max(a.length, b.length); index += 1) visit(a[index], b[index], [...path, `${index + 1}. öğe`], [...keys, String(index)], parentLeft, parentRight);
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      const a = new Map<string, unknown>(isRecord(left) ? Object.entries(left) : []);
      const b = new Map<string, unknown>(isRecord(right) ? Object.entries(right) : []);
      for (const key of new Set([...a.keys(), ...b.keys()])) visit(a.get(key), b.get(key), [...path, FIELD_LABELS[key] ?? key], [...keys, key], isRecord(left) ? left : undefined, isRecord(right) ? right : undefined);
      return;
    }
    row(left, right, path, keys, parentLeft, parentRight);
  }
  visit(local, remote, [], []);
  return rows;
}
