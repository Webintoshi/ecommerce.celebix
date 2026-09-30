import type { StorefrontDesignDocument, StorefrontDesignApplyMutation, StorefrontDesignEditorMediaOption, StorefrontDesignAssetOption } from "@celebix/saas-contracts";
import type { HomepageUndo } from "./homepage-command-model.ts";

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
