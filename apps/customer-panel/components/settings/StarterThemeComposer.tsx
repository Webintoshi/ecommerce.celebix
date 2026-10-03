"use client";

import {
  parseStorefrontAsset,
  type CatalogCategory,
  type MerchantAdminRecord,
  type Product,
  type StarterThemeComposition,
  type StarterThemeCompositionConfigV2,
  type StarterThemeCompositionConfigV3,
  type StarterThemeSectionConfigV2,
  type StorefrontAsset,
  type StorefrontDesignDestinationOption,
} from "@celebix/saas-contracts";
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ShippingProgressSettings } from "./ShippingProgressSettings";
import { StarterThemePreview } from "@/components/settings/StarterThemePreview";
import { StarterFooterEditor } from "@/components/settings/StarterFooterEditor";
import { CollectionNavigationEditor } from "@/components/settings/CollectionNavigationEditor";
import { StarterRetailSectionEditor } from "@/components/settings/StarterRetailSectionEditors";
import { catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { catalogApi } from "@/lib/catalog-ui/client";
import { merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import {
  addStarterCampaignPanel,
  addStarterHeroSlide,
  appendStarterThemeSection,
  buildStarterThemeCompositionFromSession,
  moveStarterSection,
  openStarterThemeEditorSession,
  removeStarterCampaignPanel,
  removeStarterHeroSlide,
  removeStarterSection,
  updateStarterCampaignPanel,
  updateStarterHeroSlide,
  type StarterThemeEditorState,
} from "@/lib/starter-theme-composer-model";
import { type ThemePanelKey } from "./starter-theme-subnavigation-model";
import { DesignAssetField } from "./design/DesignAssetField";
import { DesignPathField } from "./design/DesignLinkField";
import styles from "./starter-theme-composer.module.css";

type SectionKind = StarterThemeSectionConfigV2["kind"];
type EditableSectionKind = Exclude<SectionKind, "category_grid">;

const SECTION_LABELS: Readonly<Record<SectionKind, string>> = Object.freeze({
  hero: "Hero slaytı",
  category_grid: "Kategori vitrini konumu",
  product_row: "Ürün sırası",
  split_campaign: "İkili kampanya",
  brand_story: "Marka hikâyesi",
  value_propositions: "Değer önerileri",
  testimonials: "Müşteri yorumları",
});

const EDITABLE_SECTION_OPTIONS: readonly Readonly<{ kind: EditableSectionKind; label: string }>[] = Object.freeze([
  Object.freeze({ kind: "hero", label: SECTION_LABELS.hero }),
  Object.freeze({ kind: "product_row", label: SECTION_LABELS.product_row }),
  Object.freeze({ kind: "split_campaign", label: SECTION_LABELS.split_campaign }),
  Object.freeze({ kind: "brand_story", label: SECTION_LABELS.brand_story }),
  Object.freeze({ kind: "value_propositions", label: SECTION_LABELS.value_propositions }),
  Object.freeze({ kind: "testimonials", label: SECTION_LABELS.testimonials }),
]);

const PANEL_LABELS: Readonly<Record<ThemePanelKey, string>> = Object.freeze({
  visual: "Genel görünüm",
  navigation: "Menü ve duyuru",
  home: "Ana sayfa bölümleri",
  product: "Ürün sayfası",
  cart: "Sepet",
  footer: "Footer",
});

function makeSection(kind: EditableSectionKind, products: readonly Product[], assets: readonly StorefrontAsset[]): StarterThemeSectionConfigV2 | null {
  const product = products[0], image = assets.find((asset) => asset.kind === "hero") ?? assets.find((asset) => asset.kind === "category");
  if (kind === "product_row") return Object.freeze({ kind, enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 });
  if (kind === "brand_story") return Object.freeze({ kind, enabled: true, eyebrow: "Hikâyemiz", heading: "Bizi tanıyın", body: "Markanızın hikâyesini müşterilerinizle paylaşın." });
  if (kind === "value_propositions") return Object.freeze({ kind, enabled: true, items: Object.freeze([Object.freeze({ icon: "shield", heading: "Güvenli alışveriş", body: "Doğrulanmış mağaza akışlarıyla güvenle alışveriş yapın." }), Object.freeze({ icon: "return", heading: "Kolay iade", body: "Yayımlanmış iade koşullarını inceleyin." })]) });
  if (kind === "testimonials") return Object.freeze({ kind, enabled: true, heading: "Sizden gelenler", source: "approved_product_reviews", limit: 3, minimumRating: 4 });
  if (kind === "split_campaign") return image ? Object.freeze({ kind, enabled: true, panels: Object.freeze([Object.freeze({ heading: "Yeni koleksiyon", assetId: image.id, destination: "/products" })]) }) : null;
  return image ? Object.freeze({ kind, enabled: true, slides: Object.freeze([Object.freeze({ eyebrow: "Yeni sezon", heading: "Yeni koleksiyonu keşfedin", desktopAssetId: image.id, destination: "/products", ...(product ? { productId: product.id } : {}) })]) }) : null;
}

function controlId(index: number, field: string) { return `starter-section-${index}-${field}`; }

type HeroSection = Extract<StarterThemeSectionConfigV2, { kind: "hero" }>;
type SplitCampaignSection = Extract<StarterThemeSectionConfigV2, { kind: "split_campaign" }>;

function HeroSlidesEditor({
  assets,
  disabled,
  destinations,
  products,
  section,
  sectionIndex,
  update,
}: Readonly<{
  assets: readonly StorefrontAsset[];
  disabled: boolean;
  destinations: readonly StorefrontDesignDestinationOption[];
  products: readonly Product[];
  section: HeroSection;
  sectionIndex: number;
  update: (section: HeroSection) => void;
}>) {
  const heroAssets = assets.filter(({ kind }) => kind === "hero");
  const seedAsset = heroAssets[0]?.id ?? section.slides[0]?.desktopAssetId;
  return <div className={styles.entryList}>
    {section.slides.map((slide, slideIndex) => <fieldset className={styles.entryCard} key={`hero-${slideIndex}-${slide.desktopAssetId}`}>
      <legend>Hero slaytı {slideIndex + 1}</legend>
      <div className={styles.entryToolbar}><span>{slideIndex + 1} / {section.slides.length}</span><button type="button" aria-label={`Hero slaytını kaldır: ${slideIndex + 1}`} onClick={() => update(removeStarterHeroSlide(section, slideIndex))} disabled={disabled || section.slides.length <= 1}><Trash2 aria-hidden="true" /> Kaldır</button></div>
      <div className={styles.fieldGrid}>
        <label htmlFor={controlId(sectionIndex, `slide-${slideIndex}-eyebrow`)}>Üst başlık<input id={controlId(sectionIndex, `slide-${slideIndex}-eyebrow`)} value={slide.eyebrow ?? ""} maxLength={80} onChange={(event) => update(updateStarterHeroSlide(section, slideIndex, event.currentTarget.value ? { eyebrow: event.currentTarget.value } : {}, event.currentTarget.value ? [] : ["eyebrow"]))} disabled={disabled} /></label>
        <label htmlFor={controlId(sectionIndex, `slide-${slideIndex}-heading`)}>Başlık<input id={controlId(sectionIndex, `slide-${slideIndex}-heading`)} value={slide.heading} maxLength={160} onChange={(event) => update(updateStarterHeroSlide(section, slideIndex, { heading: event.currentTarget.value }))} disabled={disabled} /></label>
        <label className={styles.wide} htmlFor={controlId(sectionIndex, `slide-${slideIndex}-body`)}>Metin<textarea id={controlId(sectionIndex, `slide-${slideIndex}-body`)} value={slide.body ?? ""} maxLength={500} onChange={(event) => update(updateStarterHeroSlide(section, slideIndex, event.currentTarget.value ? { body: event.currentTarget.value } : {}, event.currentTarget.value ? [] : ["body"]))} disabled={disabled} /></label>
        <label>Desktop görseli<select value={slide.desktopAssetId} onChange={(event) => update(updateStarterHeroSlide(section, slideIndex, { desktopAssetId: event.currentTarget.value }))} disabled={disabled}>{heroAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText}</option>)}</select></label>
        <label>Mobil görseli<select value={slide.mobileAssetId ?? ""} onChange={(event) => update(updateStarterHeroSlide(section, slideIndex, event.currentTarget.value ? { mobileAssetId: event.currentTarget.value } : {}, event.currentTarget.value ? [] : ["mobileAssetId"]))} disabled={disabled}><option value="">Desktop görselini kullan</option>{heroAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText}</option>)}</select></label>
        <DesignPathField value={slide.destination} destinations={destinations} disabled={disabled} emptyLabel="Bağlantı seçin" onChange={destination => update(updateStarterHeroSlide(section, slideIndex, { destination }))}/>
        <label>Ürün hotspot<select value={slide.productId ?? ""} onChange={(event) => update(updateStarterHeroSlide(section, slideIndex, event.currentTarget.value ? { productId: event.currentTarget.value } : {}, event.currentTarget.value ? [] : ["productId"]))} disabled={disabled}><option value="">Ürün yok</option>{products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label>
      </div>
    </fieldset>)}
    <button className={styles.entryAdd} type="button" onClick={() => seedAsset ? update(addStarterHeroSlide(section, { heading: "Yeni slayt", desktopAssetId: seedAsset, destination: "/products" })) : undefined} disabled={disabled || section.slides.length >= 3 || !seedAsset}><Plus aria-hidden="true" /> Hero slaytı ekle</button>
    {!seedAsset ? <p className={styles.fieldHelp}>Yeni slayt eklemek için önce etkin bir hero görseli yükleyin.</p> : null}
  </div>;
}

function SplitCampaignPanelsEditor({
  assets,
  disabled,
  destinations,
  section,
  sectionIndex,
  update,
}: Readonly<{
  assets: readonly StorefrontAsset[];
  disabled: boolean;
  destinations: readonly StorefrontDesignDestinationOption[];
  section: SplitCampaignSection;
  sectionIndex: number;
  update: (section: SplitCampaignSection) => void;
}>) {
  const seedAsset = assets[0]?.id ?? section.panels[0]?.assetId;
  return <div className={styles.entryList}>
    {section.panels.map((panel, panelIndex) => <fieldset className={styles.entryCard} key={`campaign-${panelIndex}-${panel.assetId}`}>
      <legend>Kampanya paneli {panelIndex + 1}</legend>
      <div className={styles.entryToolbar}><span>{panelIndex + 1} / {section.panels.length}</span><button type="button" aria-label={`Kampanya panelini kaldır: ${panelIndex + 1}`} onClick={() => update(removeStarterCampaignPanel(section, panelIndex))} disabled={disabled || section.panels.length <= 1}><Trash2 aria-hidden="true" /> Kaldır</button></div>
      <div className={styles.fieldGrid}>
        <label htmlFor={controlId(sectionIndex, `panel-${panelIndex}-eyebrow`)}>Üst başlık<input id={controlId(sectionIndex, `panel-${panelIndex}-eyebrow`)} value={panel.eyebrow ?? ""} maxLength={80} onChange={(event) => update(updateStarterCampaignPanel(section, panelIndex, event.currentTarget.value ? { eyebrow: event.currentTarget.value } : {}, event.currentTarget.value ? [] : ["eyebrow"]))} disabled={disabled} /></label>
        <label htmlFor={controlId(sectionIndex, `panel-${panelIndex}-heading`)}>Başlık<input id={controlId(sectionIndex, `panel-${panelIndex}-heading`)} value={panel.heading} maxLength={160} onChange={(event) => update(updateStarterCampaignPanel(section, panelIndex, { heading: event.currentTarget.value }))} disabled={disabled} /></label>
        <label className={styles.wide} htmlFor={controlId(sectionIndex, `panel-${panelIndex}-body`)}>Metin<textarea id={controlId(sectionIndex, `panel-${panelIndex}-body`)} value={panel.body ?? ""} maxLength={500} onChange={(event) => update(updateStarterCampaignPanel(section, panelIndex, event.currentTarget.value ? { body: event.currentTarget.value } : {}, event.currentTarget.value ? [] : ["body"]))} disabled={disabled} /></label>
        <label>Görsel<select value={panel.assetId} onChange={(event) => update(updateStarterCampaignPanel(section, panelIndex, { assetId: event.currentTarget.value }))} disabled={disabled}>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText}</option>)}</select></label>
        <DesignPathField value={panel.destination} destinations={destinations} disabled={disabled} emptyLabel="Bağlantı seçin" onChange={destination => update(updateStarterCampaignPanel(section, panelIndex, { destination }))}/>
      </div>
    </fieldset>)}
    <button className={styles.entryAdd} type="button" onClick={() => seedAsset ? update(addStarterCampaignPanel(section, { heading: "Yeni kampanya", assetId: seedAsset, destination: "/products" })) : undefined} disabled={disabled || section.panels.length >= 2 || !seedAsset}><Plus aria-hidden="true" /> Kampanya paneli ekle</button>
    {!seedAsset ? <p className={styles.fieldHelp}>Yeni panel eklemek için önce etkin bir vitrin görseli yükleyin.</p> : null}
  </div>;
}

export function StarterThemeComposer({
  activePanel,
  canManage,
  showPreview = true,
  showAnnouncement = true,
  value,
  onChange,
  destinations = [],
  onAssetUploaded,
  onMediaBusyChange,
  onValidationChange,
}: Readonly<{
  activePanel: ThemePanelKey;
  canManage: boolean;
  showPreview?: boolean;
  showAnnouncement?: boolean;
  value: StarterThemeComposition;
  onChange: (value: StarterThemeCompositionConfigV2 | StarterThemeCompositionConfigV3) => void;
  destinations?: readonly StorefrontDesignDestinationOption[];
  onAssetUploaded?: (asset: StorefrontAsset) => void;
  onMediaBusyChange?: (id: string, busy: boolean) => void;
  onValidationChange?: (invalid: boolean) => void;
}>) {
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [assets, setAssets] = useState<readonly StorefrontAsset[]>([]);
  const [pages, setPages] = useState<readonly MerchantAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resourceError, setResourceError] = useState("");
  const resourceRequest = useRef(0);
  const [announcementText, setAnnouncementText] = useState<string|null>(null);
  const [announcementError, setAnnouncementError] = useState("");
  const lastAnnouncementWrite = useRef<string|null>(null);
  const [featuredSelection, setFeaturedSelection] = useState<Readonly<{ categoryId: string; assetId: string }> | null>(null);
  const lastComposerWrite = useRef<string | null>(null);
  const compositionIdentity = JSON.stringify(value);
  useEffect(() => {
    // A local write is acknowledged once. A later restore/conflict replacement,
    // including one with equal saved values, discards the incomplete local pair.
    if (lastComposerWrite.current !== compositionIdentity) setFeaturedSelection(null);
    lastComposerWrite.current = null;
  }, [value, compositionIdentity]);
  const announcementIdentity = JSON.stringify(value?.announcement?.items);
  useEffect(() => {
    if (lastAnnouncementWrite.current !== announcementIdentity) { setAnnouncementText(null); setAnnouncementError(""); }
  }, [announcementIdentity]);
  const [newSection, setNewSection] = useState<EditableSectionKind>("product_row");
  const needsCategories = activePanel === "navigation" || activePanel === "home";
  const needsProducts = showPreview || activePanel === "home";
  const needsAssets = showPreview || activePanel === "navigation" || activePanel === "home";
  const needsPages = activePanel === "footer";

  const load = useCallback(async () => {
    const request = ++resourceRequest.current;
    setLoading(true); setResourceError("");
    try {
      const [loadedPages, loadedCategories, productPage, response] = await Promise.all([
        needsPages ? merchantAdminApi.records("page") : Promise.resolve(null),
        needsCategories ? catalogOnboardingClient.listCategories() : Promise.resolve(null),
        needsProducts ? catalogApi.listProducts({ status: "active" }) : Promise.resolve(null),
        needsAssets ? fetch("/api/storefront-assets", { credentials: "same-origin", cache: "no-store" }) : Promise.resolve(null),
      ]);
      let loadedAssets: readonly StorefrontAsset[] | null = null;
      if (response) {
        if (!response.ok) throw new Error("asset_unavailable");
        const body = await response.json() as { assets?: unknown };
        if (!Array.isArray(body.assets) || body.assets.length > 64) throw new Error("asset_unavailable");
        loadedAssets = Object.freeze(body.assets.map(parseStorefrontAsset).filter((entry) => entry.status === "active"));
      }
      if (request !== resourceRequest.current) return;
      if (loadedPages) setPages(Object.freeze(loadedPages.filter((entry) => entry.status === "active" && entry.config.published === true)));
      if (loadedCategories) setCategories(Object.freeze(loadedCategories.filter((entry) => entry.status === "active")));
      if (productPage) setProducts(Object.freeze(productPage.items.filter((entry) => entry.status === "active")));
      if (loadedAssets) setAssets(loadedAssets);
    } catch {
      if (request === resourceRequest.current) setResourceError("Kaynaklar yüklenemiyor. Taslağınız korundu.");
    } finally {
      if (request === resourceRequest.current) setLoading(false);
    }
  }, [needsAssets, needsCategories, needsPages, needsProducts]);

  const session = useMemo(() => {
    try { return openStarterThemeEditorSession(value); }
    catch { return null; }
  }, [value]);
  const canLoadResources = session !== null;

  useEffect(() => {
    if (canLoadResources) void load();
    return () => { resourceRequest.current += 1; };
  }, [canLoadResources, load]);

  const preview = useMemo(() => {
    if (!session) return null;
    try { return buildStarterThemeCompositionFromSession(session); }
    catch { return null; }
  }, [session]);
  const productTitles = useMemo(() => Object.freeze(products.slice(0, 3).map(({ title }) => title)), [products]);
  if (!session) return <section className={`${styles.shell} ${showPreview ? "" : styles.embeddedShell}`}>
    <p className={styles.error} role="alert">Kayıtlı tema verisi açılamadı. Tasarım korundu; yeniden deneyin veya destek alın.</p>
  </section>;
  const editorSession = session;
  const state = editorSession.state;
  const disabled = !canManage;
  const patch = (patchValue: Partial<StarterThemeEditorState>) => {
    try {
      const next = buildStarterThemeCompositionFromSession(editorSession, patchValue);
      lastComposerWrite.current = JSON.stringify(next);
      onChange(next);
      setError("");
    } catch {
      setError("Tema alanı geçersiz. Değeri kontrol edin; tasarım korundu.");
    }
  };
  const featuredPair = featuredSelection ?? { categoryId: state.navigation.featuredCategoryId ?? "", assetId: state.navigation.featuredAssetId ?? "" };
  const featuredIncomplete = Boolean(featuredPair.categoryId) !== Boolean(featuredPair.assetId);
  const chooseFeatured = (field: "categoryId" | "assetId", selected: string) => {
    const pair = { ...featuredPair, [field]: selected };
    setFeaturedSelection(pair);
    setError("");
    if (pair.categoryId && pair.assetId) patch({ navigation: { ...state.navigation, featuredCategoryId: pair.categoryId, featuredAssetId: pair.assetId } });
    else if (!selected && (state.navigation.featuredCategoryId || state.navigation.featuredAssetId)) {
      const navigation = { ...state.navigation };
      delete navigation.featuredCategoryId; delete navigation.featuredAssetId;
      patch({ navigation });
    }
  };
  const updateSection = (index: number, section: StarterThemeSectionConfigV2) => patch({
    sections: Object.freeze(state.sections.map((entry, position) => position === index
      ? Object.freeze({ ...section, ...("sectionId" in entry ? { sectionId: entry.sectionId } : {}) })
      : entry)),
  });

  function addSection() {
    const section = makeSection(newSection, products, assets);
    if (!section) { setError("Bu bölüm için önce etkin kategori veya vitrin görseli ekleyin."); return; }
    if (newSection !== "product_row" && state.sections.some(({ kind }) => kind === newSection)) { setError("Bu bölüm türü yalnız bir kez eklenebilir."); return; }
    try {
      onChange(appendStarterThemeSection(editorSession, section));
      setError("");
    } catch {
      setError("Tema alanı geçersiz. Değeri kontrol edin; tasarım korundu.");
    }
  }

  return <section className={`${styles.shell} ${showPreview ? "" : styles.embeddedShell}`}>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {resourceError ? <div className={styles.resourceError}><p className={styles.error} role="alert">{resourceError}</p><button type="button" onClick={() => void load()} disabled={loading}>Yeniden dene</button></div> : null}
    {!canManage ? <p className={styles.readOnly} role="status">Yalnız görüntüleme</p> : null}
    {loading ? <p className={styles.loading}><LoaderCircle aria-hidden="true" /> Yükleniyor…</p> : <form className={`${styles.workspace} ${showPreview ? "" : styles.editorOnly}`} onSubmit={(event) => event.preventDefault()}>
      <div className={styles.editor}>
        <p className={styles.notice}>Değişiklikleri önizleyin. Uygula ile mağazaya yansır.</p>
        <section
          className={styles.themePanel}
          role="region"
          id={`starter-theme-panel-${activePanel}`}
          aria-label={PANEL_LABELS[activePanel]}
          tabIndex={0}
        >
        {activePanel === "visual" ? <fieldset className={styles.panel} disabled={disabled}>
          <legend>Görsel sistem</legend>
          <div className={styles.fieldGrid}>
            <label>Renk paleti<select value={state.visual.colorScheme} onChange={(event) => patch({ visual: { ...state.visual, colorScheme: event.currentTarget.value as StarterThemeEditorState["visual"]["colorScheme"] } })}><option value="neutral">Nötr</option><option value="warm">Sıcak</option><option value="dark">Koyu</option><option value="ocean">Okyanus</option></select></label>
            <label>Başlık stili<select value={state.visual.headingStyle} onChange={(event) => patch({ visual: { ...state.visual, headingStyle: event.currentTarget.value as StarterThemeEditorState["visual"]["headingStyle"] } })}><option value="serif">Serif</option><option value="sans">Sans serif</option></select></label>
            <label>Köşe stili<select value={state.visual.cornerStyle} onChange={(event) => patch({ visual: { ...state.visual, cornerStyle: event.currentTarget.value as StarterThemeEditorState["visual"]["cornerStyle"] } })}><option value="soft">Yumuşak</option><option value="square">Köşeli</option></select></label>
            <label>Bölüm aralığı<select value={state.visual.sectionSpacing} onChange={(event) => patch({ visual: { ...state.visual, sectionSpacing: event.currentTarget.value as StarterThemeEditorState["visual"]["sectionSpacing"] } })}><option value="compact">Kompakt</option><option value="balanced">Dengeli</option><option value="airy">Ferah</option></select></label>
            <label>Ürün kartı<select value={state.visual.productCardStyle} onChange={(event) => patch({ visual: { ...state.visual, productCardStyle: event.currentTarget.value as StarterThemeEditorState["visual"]["productCardStyle"] } })}><option value="editorial">Editoryal</option><option value="compact">Kompakt</option></select></label>
            <label>Ürün görseli<select value={state.visual.productImageRatio} onChange={(event) => patch({ visual: { ...state.visual, productImageRatio: event.currentTarget.value as StarterThemeEditorState["visual"]["productImageRatio"] } })}><option value="portrait">Dikey</option><option value="square">Kare</option></select></label>
          </div>
        </fieldset> : null}
        {activePanel === "navigation" ? <fieldset className={styles.panel} disabled={disabled}>
          <legend>Üst alan ve menü</legend>
          <section className={styles.navigationGroup} aria-label="Üst alan">
            <h3 className={styles.groupTitle}>Üst alan</h3>
            <div className={styles.fieldGrid}>
              <label>Yerleşim<select value={state.visual.headerLayout} onChange={(event) => patch({ visual: { ...state.visual, headerLayout: event.currentTarget.value as StarterThemeEditorState["visual"]["headerLayout"] } })}><option value="menu_logo_actions">Menü solda · logo ortada</option><option value="logo_menu_actions">Logo solda · menü yanında</option><option value="stacked">Logo üstte · menü altta</option></select></label>
              <label>Zemin<select value={state.visual.headerStyle} onChange={(event) => patch({ visual: { ...state.visual, headerStyle: event.currentTarget.value as StarterThemeEditorState["visual"]["headerStyle"] } })}><option value="overlay">Görsel üzerinde</option><option value="solid">Düz zemin</option></select>{state.visual.headerStyle === "overlay" ? <small className={styles.fieldHelp}>İlk bannerın üzerinde görünür.</small> : null}</label>
              <label>Genişlik<select value={state.visual.headerWidth} onChange={(event) => patch({ visual: { ...state.visual, headerWidth: event.currentTarget.value as StarterThemeEditorState["visual"]["headerWidth"] } })}><option value="wide">Geniş</option><option value="contained">Sınırlı</option></select></label>
            </div>
          </section>
          {showAnnouncement ? <section className={styles.navigationGroup} aria-label="Duyuru">
          <label className={styles.check}><input type="checkbox" checked={state.announcement.enabled} onChange={(event) => patch({ announcement: { ...state.announcement, enabled: event.currentTarget.checked } })} /> Duyuruyu göster</label>
          <label>Duyuru metni<textarea maxLength={1452} value={announcementText ?? state.announcement.items.join("\n")} aria-invalid={Boolean(announcementError)} aria-describedby={announcementError ? "starter-announcement-error" : undefined} onChange={(event) => {
            setAnnouncementText(event.currentTarget.value);
            const items=event.currentTarget.value.split(/\n|·/).map(item=>item.trim()).filter(Boolean);
            if(!items.length||items.length>12||items.some(item=>item.length>120)){setAnnouncementError("1–12 mesaj yazın; her mesaj en fazla 120 karakter olmalı. Girişleriniz korunuyor.");return;}
            lastAnnouncementWrite.current=JSON.stringify(items);setAnnouncementError("");patch({announcement:{...state.announcement,items:Object.freeze(items)}});
          }} />{announcementError?<small id="starter-announcement-error" className={styles.error} role="alert">{announcementError}</small>:null}</label>
          <DesignPathField value={state.announcement.destination??""} destinations={destinations} disabled={disabled} onChange={destination=>{const announcement={...state.announcement};if(destination)announcement.destination=destination;else delete announcement.destination;patch({announcement});}}/>
          </section> : null}
          <CollectionNavigationEditor navigation={state.navigation} categories={categories} destinations={destinations} disabled={disabled} onChange={navigation => patch({ navigation })} />
          <section className={styles.navigationGroup} aria-label="Öne çıkan kategori">
            <h3 className={styles.groupTitle}>Öne çıkan kategori</h3>
            <label>Kategori<select value={featuredPair.categoryId} aria-describedby={featuredIncomplete ? "starter-featured-selection-help" : undefined} onChange={(event) => chooseFeatured("categoryId", event.currentTarget.value)}><option value="">Kategori yok</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <DesignAssetField
              label="Görsel"
              value={featuredPair.assetId}
              assets={assets.map((asset) => ({ id: asset.id, url: asset.publicUrl, altText: asset.altText, width: asset.width, height: asset.height }))}
              kind="category"
              disabled={disabled}
              onChange={(assetId) => chooseFeatured("assetId", assetId)}
              onUploaded={(asset) => {
                setAssets((current) => Object.freeze([...current.filter((entry) => entry.id !== asset.id), asset]));
                onAssetUploaded?.(asset);
              }}
              onBusyChange={onMediaBusyChange}
            />
            {featuredIncomplete ? <p id="starter-featured-selection-help" className={styles.fieldHelp} role="status">Kategori ve görsel seçin. İkisi tamamlandığında kaydedilir.</p> : null}
          </section>
        </fieldset> : null}
        {activePanel === "home" ? <section className={styles.sectionList} aria-labelledby="starter-sections-title">
          <div className={styles.sectionHeading}><div><h2 id="starter-sections-title">Ana sayfa bölümleri</h2><p>Sıralama için sürükleme gerekmez; yukarı ve aşağı kontrolleri klavyeyle çalışır.</p></div></div>
          {state.sections.length === 0 ? <p className={styles.emptyState}>Ana sayfanız şu anda boş. Aşağıdan istediğiniz ilk bölümü ekleyin.</p> : null}
          <ol>{state.sections.map((section, index) => <li className={styles.sectionCard} key={`${section.kind}-${index}`}>
            <div className={styles.sectionToolbar}><div><span>{index + 1}</span><strong>{SECTION_LABELS[section.kind]}</strong></div><div>
              <button type="button" aria-label={`${SECTION_LABELS[section.kind]} bölümünü yukarı taşı`} onClick={() => patch({ sections: moveStarterSection(state.sections, index, -1) })} disabled={disabled || index === 0}><ArrowUp aria-hidden="true" /></button>
              <button type="button" aria-label={`${SECTION_LABELS[section.kind]} bölümünü aşağı taşı`} onClick={() => patch({ sections: moveStarterSection(state.sections, index, 1) })} disabled={disabled || index === state.sections.length - 1}><ArrowDown aria-hidden="true" /></button>
              {section.kind !== "category_grid" ? <button type="button" aria-label={`${SECTION_LABELS[section.kind]} bölümünü kaldır`} onClick={() => patch({ sections: removeStarterSection(state.sections, index) })} disabled={disabled}><Trash2 aria-hidden="true" /></button> : null}
            </div></div>
            {section.kind !== "category_grid" ? <label className={styles.check}><input type="checkbox" checked={section.enabled} onChange={(event) => updateSection(index, { ...section, enabled: event.currentTarget.checked })} disabled={disabled} /> Bölümü göster</label> : null}
            {section.kind === "hero" ? <HeroSlidesEditor assets={assets} destinations={destinations} disabled={disabled} products={products} section={section} sectionIndex={index} update={(updated) => updateSection(index, updated)} /> : null}
            {section.kind === "category_grid" ? <p className={styles.fieldHelp}>Kategori içeriği aşağıdaki tek kategori vitrini alanından yönetilir. Bu kart yalnız bölümün ana sayfadaki sırasını gösterir.</p> : null}
            {section.kind === "product_row" ? <div className={styles.fieldGrid}><label>Başlık<input value={section.heading} maxLength={160} onChange={(event) => updateSection(index, { ...section, heading: event.currentTarget.value })} disabled={disabled} /></label><label>Kaynak<select value={section.source} onChange={(event) => { const source = event.currentTarget.value as "latest" | "sale" | "category"; updateSection(index, source === "category" ? { ...section, source, categoryId: categories[0]?.id ?? "" } : { kind: "product_row", enabled: section.enabled, heading: section.heading, source, limit: section.limit }); }} disabled={disabled}><option value="latest">Yeni ürünler</option><option value="sale">İndirimdekiler</option><option value="category">Kategori</option></select></label>{section.source === "category" ? <label>Kategori<select value={section.categoryId} onChange={(event) => updateSection(index, { ...section, categoryId: event.currentTarget.value })} disabled={disabled}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label> : null}<label>Ürün sayısı<select value={section.limit} onChange={(event) => updateSection(index, { ...section, limit: Number(event.currentTarget.value) as 4 | 8 | 12 })} disabled={disabled}><option value="4">4</option><option value="8">8</option><option value="12">12</option></select></label></div> : null}
            {section.kind === "split_campaign" ? <SplitCampaignPanelsEditor assets={assets} destinations={destinations} disabled={disabled} section={section} sectionIndex={index} update={(updated) => updateSection(index, updated)} /> : null}
            {section.kind === "brand_story" ? <div className={styles.fieldGrid}><label>Başlık<input value={section.heading} maxLength={160} onChange={(event) => updateSection(index, { ...section, heading: event.currentTarget.value })} disabled={disabled} /></label><label className={styles.wide}>Metin<textarea value={section.body} maxLength={1000} onChange={(event) => updateSection(index, { ...section, body: event.currentTarget.value })} disabled={disabled} /></label></div> : null}
            {section.kind === "value_propositions" || section.kind === "testimonials" ? <StarterRetailSectionEditor disabled={disabled} section={section} update={(updated) => updateSection(index, updated)} /> : null}
          </li>)}</ol>
          <div className={styles.addBar}><label>Yeni bölüm<select value={newSection} onChange={(event) => setNewSection(event.currentTarget.value as EditableSectionKind)} disabled={disabled}>{EDITABLE_SECTION_OPTIONS.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}</select></label><button type="button" onClick={addSection} disabled={disabled}><Plus aria-hidden="true" /> Bölüm ekle</button></div>
        </section> : null}
        {activePanel === "product" ? <fieldset className={styles.panel} disabled={disabled}><legend>Ürün detayı</legend><label>Galeri<select value={state.productDetail.galleryStyle} onChange={(event) => patch({ productDetail: { ...state.productDetail, galleryStyle: event.currentTarget.value as "grid" | "rail" } })}><option value="grid">Izgara</option><option value="rail">Kaydırmalı</option></select></label><label className={styles.check}><input type="checkbox" checked={state.cart.showQuantitySelector} onChange={(event) => patch({ cart: { ...state.cart, showQuantitySelector: event.currentTarget.checked } })} /> Ürün ve yan sepette miktar değiştirmeyi göster</label>{(["showSku", "showBrand", "showBreadcrumbs", "showRelatedProducts", "showApprovedReviews", "mobileStickyPurchase", "showSizeGuide"] as const).map((key) => <label className={styles.check} key={key}><input type="checkbox" checked={state.productDetail[key]} onChange={(event) => patch({ productDetail: { ...state.productDetail, [key]: event.currentTarget.checked } })} />{{ showSku: "SKU göster", showBrand: "Marka göster", showBreadcrumbs: "İçerik yolunu göster", showRelatedProducts: "Benzer ürünleri göster", showApprovedReviews: "Onaylı yorumlar", mobileStickyPurchase: "Mobil sabit satın alma", showSizeGuide: "Boyut rehberi" }[key]}</label>)}<p className={styles.label}>Ürün bilgi blokları</p>{(["description", "materials_and_care", "certifications", "shipping_and_returns"] as const).map((key) => <label className={styles.check} key={key}><input type="checkbox" checked={state.productDetail.informationSections.includes(key)} onChange={(event) => { const informationSections = event.currentTarget.checked ? [...state.productDetail.informationSections, key] : state.productDetail.informationSections.filter((item) => item !== key); if (informationSections.length) patch({ productDetail: { ...state.productDetail, informationSections: Object.freeze(informationSections) } }); }} />{{ description: "Açıklama", materials_and_care: "Malzeme ve bakım", certifications: "Sertifikalar", shipping_and_returns: "Kargo ve iade" }[key]}</label>)}</fieldset> : null}
        {activePanel === "cart" ? <fieldset className={styles.panel} disabled={disabled}><legend>Sepet deneyimi</legend><label className={styles.check}><input type="checkbox" checked={state.cart.showCheckoutReadiness} onChange={(event) => patch({ cart: { ...state.cart, showCheckoutReadiness: event.currentTarget.checked } })} /> Ödeme hazırlığını göster</label><ShippingProgressSettings cart={state.cart} disabled={disabled} onChange={(cart) => patch({ cart })} onValidationChange={onValidationChange} /><label>Güven mesajı<input maxLength={160} value={state.cart.trustMessage ?? ""} onChange={(event) => patch({ cart: { ...state.cart, trustMessage: event.currentTarget.value } })} /></label></fieldset> : null}
        {activePanel === "footer" ? <StarterFooterEditor categories={categories} collections={destinations.filter(item => item.kind === "catalog_collection")} disabled={disabled} pages={pages} update={(footer) => patch({ footer })} value={state.footer} /> : null}
        </section>
      </div>
      {showPreview !== false ? <aside className={styles.preview}>{preview ? <StarterThemePreview composition={preview} productTitles={productTitles} storefrontHostname={null} /> : <p role="alert">Önizleme için zorunlu alanları tamamlayın.</p>}</aside> : null}
    </form>}
  </section>;
}
