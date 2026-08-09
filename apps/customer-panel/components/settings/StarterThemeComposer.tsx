"use client";

import {
  parseStorefrontAsset,
  type CatalogCategory,
  type MerchantAdminRecord,
  type Product,
  type StarterThemeCompositionConfigV2,
  type StarterThemeSectionConfigV2,
  type StorefrontAsset,
} from "@celebix/saas-contracts";
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StarterThemePreview } from "@/components/settings/StarterThemePreview";
import { StarterFooterEditor } from "@/components/settings/StarterFooterEditor";
import { StarterRetailSectionEditor } from "@/components/settings/StarterRetailSectionEditors";
import { catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { catalogApi } from "@/lib/catalog-ui/client";
import { merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import {
  addStarterCampaignPanel,
  addStarterHeroSlide,
  buildStarterThemeComposition,
  moveStarterSection,
  removeStarterCampaignPanel,
  removeStarterHeroSlide,
  updateStarterCampaignPanel,
  updateStarterHeroSlide,
  updateStarterNavigationRoots,
  type StarterThemeEditorState,
} from "@/lib/starter-theme-composer-model";
import { type ThemePanelKey } from "./starter-theme-subnavigation-model";
import styles from "./starter-theme-composer.module.css";

type SectionKind = StarterThemeSectionConfigV2["kind"];

const SECTION_LABELS: Readonly<Record<SectionKind, string>> = Object.freeze({
  hero: "Hero slaytı",
  category_grid: "Kategori vitrini",
  product_row: "Ürün sırası",
  split_campaign: "İkili kampanya",
  brand_story: "Marka hikâyesi",
  value_propositions: "Değer önerileri",
  testimonials: "Müşteri yorumları",
});

const PANEL_LABELS: Readonly<Record<ThemePanelKey, string>> = Object.freeze({
  visual: "Genel görünüm",
  navigation: "Menü ve duyuru",
  home: "Ana sayfa bölümleri",
  product: "Ürün sayfası",
  cart: "Sepet",
  footer: "Footer",
});

function editorState(config: StarterThemeCompositionConfigV2): StarterThemeEditorState {
  const { schemaVersion: _schemaVersion, ...state } = config;
  return state;
}

function makeSection(kind: SectionKind, categories: readonly CatalogCategory[], products: readonly Product[], assets: readonly StorefrontAsset[]): StarterThemeSectionConfigV2 | null {
  const category = categories[0], product = products[0], image = assets.find((asset) => asset.kind === "hero") ?? assets.find((asset) => asset.kind === "category");
  if (kind === "product_row") return Object.freeze({ kind, enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 });
  if (kind === "brand_story") return Object.freeze({ kind, enabled: true, eyebrow: "Hikâyemiz", heading: "Bizi tanıyın", body: "Markanızın hikâyesini müşterilerinizle paylaşın." });
  if (kind === "value_propositions") return Object.freeze({ kind, enabled: true, items: Object.freeze([Object.freeze({ icon: "shield", heading: "Güvenli alışveriş", body: "Doğrulanmış mağaza akışlarıyla güvenle alışveriş yapın." }), Object.freeze({ icon: "return", heading: "Kolay iade", body: "Yayımlanmış iade koşullarını inceleyin." })]) });
  if (kind === "testimonials") return Object.freeze({ kind, enabled: true, heading: "Sizden gelenler", source: "approved_product_reviews", limit: 3, minimumRating: 4 });
  if (kind === "category_grid") return category ? Object.freeze({ kind, enabled: true, heading: "Kategorileri keşfedin", categoryIds: Object.freeze([category.id]) }) : null;
  if (kind === "split_campaign") return image ? Object.freeze({ kind, enabled: true, panels: Object.freeze([Object.freeze({ heading: "Yeni koleksiyon", assetId: image.id, destination: "/products" })]) }) : null;
  return image ? Object.freeze({ kind, enabled: true, slides: Object.freeze([Object.freeze({ eyebrow: "Yeni sezon", heading: "Yeni koleksiyonu keşfedin", desktopAssetId: image.id, destination: "/products", ...(product ? { productId: product.id } : {}) })]) }) : null;
}

function controlId(index: number, field: string) { return `starter-section-${index}-${field}`; }

type HeroSection = Extract<StarterThemeSectionConfigV2, { kind: "hero" }>;
type SplitCampaignSection = Extract<StarterThemeSectionConfigV2, { kind: "split_campaign" }>;

function HeroSlidesEditor({
  assets,
  disabled,
  products,
  section,
  sectionIndex,
  update,
}: Readonly<{
  assets: readonly StorefrontAsset[];
  disabled: boolean;
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
        <label>Hedef<input value={slide.destination} maxLength={500} onChange={(event) => update(updateStarterHeroSlide(section, slideIndex, { destination: event.currentTarget.value }))} disabled={disabled} /></label>
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
  section,
  sectionIndex,
  update,
}: Readonly<{
  assets: readonly StorefrontAsset[];
  disabled: boolean;
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
        <label>Hedef<input value={panel.destination} maxLength={500} onChange={(event) => update(updateStarterCampaignPanel(section, panelIndex, { destination: event.currentTarget.value }))} disabled={disabled} /></label>
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
  value,
  onChange,
}: Readonly<{
  activePanel: ThemePanelKey;
  canManage: boolean;
  showPreview?: boolean;
  value: StarterThemeCompositionConfigV2;
  onChange: (value: StarterThemeCompositionConfigV2) => void;
}>) {
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [assets, setAssets] = useState<readonly StorefrontAsset[]>([]);
  const [pages, setPages] = useState<readonly MerchantAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newSection, setNewSection] = useState<SectionKind>("product_row");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [loadedPages, loadedCategories, productPage, response] = await Promise.all([
        merchantAdminApi.records("page"),
        catalogOnboardingClient.listCategories(),
        catalogApi.listProducts({ status: "active" }),
        fetch("/api/storefront-assets", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (!response.ok) throw new Error("asset_unavailable");
      const body = await response.json() as { assets?: unknown };
      if (!Array.isArray(body.assets) || body.assets.length > 64) throw new Error("asset_unavailable");
      setPages(Object.freeze(loadedPages.filter((entry) => entry.status === "active" && entry.config.published === true)));
      setCategories(Object.freeze(loadedCategories.filter((entry) => entry.status === "active")));
      setProducts(Object.freeze(productPage.items.filter((entry) => entry.status === "active")));
      setAssets(Object.freeze(body.assets.map(parseStorefrontAsset).filter((entry) => entry.status === "active")));
    } catch { setError("Kampanya Starter düzenleyicisi şu anda yüklenemiyor."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const state = useMemo(() => editorState(value), [value]);
  const preview = useMemo(() => { try { return buildStarterThemeComposition(state); } catch { return null; } }, [state]);
  const productTitles = useMemo(() => Object.freeze(products.slice(0, 3).map(({ title }) => title)), [products]);
  const disabled = !canManage;
  const patch = (patchValue: Partial<StarterThemeEditorState>) => {
    try {
      onChange(buildStarterThemeComposition({ ...state, ...patchValue }));
      setError("");
    } catch {
      setError("Tema alanı geçersiz. Değeri kontrol edin; taslak değiştirilmedi.");
    }
  };
  const updateSection = (index: number, section: StarterThemeSectionConfigV2) => patch({ sections: Object.freeze(state.sections.map((entry, position) => position === index ? section : entry)) });

  function addSection() {
    const section = makeSection(newSection, categories, products, assets);
    if (!section) { setError("Bu bölüm için önce etkin kategori veya vitrin görseli ekleyin."); return; }
    if (newSection !== "product_row" && state.sections.some(({ kind }) => kind === newSection)) { setError("Bu bölüm türü yalnız bir kez eklenebilir."); return; }
    patch({ sections: Object.freeze([...state.sections, section]) }); setError("");
  }

  return <main className={styles.shell}>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!canManage ? <p className={styles.readOnly} role="status">Yalnız görüntüleme</p> : null}
    {loading ? <p className={styles.loading}><LoaderCircle aria-hidden="true" /> Yükleniyor…</p> : <form className={`${styles.workspace} ${showPreview ? "" : styles.editorOnly}`} onSubmit={(event) => event.preventDefault()}>
      <div className={styles.editor}>
        <p className={styles.notice}>Bu alanlar aynı tasarım taslağına otomatik kaydedilir. Vitrine çıkarmak için üstteki tek Yayınla düğmesini kullanın.</p>
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
          <legend>Duyuru ve navigasyon</legend>
          <div className={styles.fieldGrid}>
            <label>Header düzeni<select value={state.visual.headerLayout} onChange={(event) => patch({ visual: { ...state.visual, headerLayout: event.currentTarget.value as StarterThemeEditorState["visual"]["headerLayout"] } })}><option value="menu_logo_actions">Menü solda · logo ortada</option><option value="logo_menu_actions">Logo solda · menü yanında</option><option value="stacked">Logo üstte · menü altta</option></select></label>
            <label>Header zemini<select value={state.visual.headerStyle} onChange={(event) => patch({ visual: { ...state.visual, headerStyle: event.currentTarget.value as StarterThemeEditorState["visual"]["headerStyle"] } })}><option value="overlay">Görsel üzerinde</option><option value="solid">Düz zemin</option></select></label>
            <label>Header genişliği<select value={state.visual.headerWidth} onChange={(event) => patch({ visual: { ...state.visual, headerWidth: event.currentTarget.value as StarterThemeEditorState["visual"]["headerWidth"] } })}><option value="wide">Geniş</option><option value="contained">Sınırlı</option></select></label>
          </div>
          <label className={styles.check}><input type="checkbox" checked={state.announcement.enabled} onChange={(event) => patch({ announcement: { ...state.announcement, enabled: event.currentTarget.checked } })} /> Duyuru şeridini göster</label>
          <label>Duyuru metni<input maxLength={160} value={state.announcement.items.join(" · ")} onChange={(event) => patch({ announcement: { ...state.announcement, items: Object.freeze(event.currentTarget.value.split("·").map((item) => item.trim()).filter(Boolean).slice(0, 12)) } })} /></label>
          <label>Duyuru hedefi<input maxLength={500} placeholder="/pages/odeme-teslimat" value={state.announcement.destination ?? ""} onChange={(event) => { const announcement = { ...state.announcement }; if (event.currentTarget.value) announcement.destination = event.currentTarget.value; else delete announcement.destination; patch({ announcement }); }} /></label>
          <p className={styles.label}>Ana menü kategorileri</p>
          <div className={styles.choiceGrid}>{categories.length ? categories.map((category) => <label className={styles.check} key={category.id}><input type="checkbox" checked={state.navigation.rootCategoryIds.includes(category.id)} onChange={(event) => { const ids = event.currentTarget.checked ? [...state.navigation.rootCategoryIds, category.id].slice(0, 8) : state.navigation.rootCategoryIds.filter((id) => id !== category.id); patch({ navigation: updateStarterNavigationRoots(state.navigation, ids) }); }} />{category.name}</label>) : <p>Henüz etkin kategori yok.</p>}</div>
          <div className={styles.fieldGrid}>
            <label>Öne çıkan kategori<select value={state.navigation.featuredCategoryId ?? ""} onChange={(event) => { const navigation = { ...state.navigation }; if (event.currentTarget.value) navigation.featuredCategoryId = event.currentTarget.value; else delete navigation.featuredCategoryId; patch({ navigation }); }}><option value="">Öne çıkan kategori yok</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>Öne çıkan görsel<select value={state.navigation.featuredAssetId ?? ""} onChange={(event) => { const navigation = { ...state.navigation }; if (event.currentTarget.value) navigation.featuredAssetId = event.currentTarget.value; else delete navigation.featuredAssetId; patch({ navigation }); }}><option value="">Öne çıkan görsel yok</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.altText}</option>)}</select></label>
          </div>
        </fieldset> : null}
        {activePanel === "home" ? <section className={styles.sectionList} aria-labelledby="starter-sections-title">
          <div className={styles.sectionHeading}><div><h2 id="starter-sections-title">Ana sayfa bölümleri</h2><p>Sıralama için sürükleme gerekmez; yukarı ve aşağı kontrolleri klavyeyle çalışır.</p></div></div>
          <ol>{state.sections.map((section, index) => <li className={styles.sectionCard} key={`${section.kind}-${index}`}>
            <div className={styles.sectionToolbar}><div><span>{index + 1}</span><strong>{SECTION_LABELS[section.kind]}</strong></div><div>
              <button type="button" aria-label={`${SECTION_LABELS[section.kind]} bölümünü yukarı taşı`} onClick={() => patch({ sections: moveStarterSection(state.sections, index, -1) })} disabled={disabled || index === 0}><ArrowUp aria-hidden="true" /></button>
              <button type="button" aria-label={`${SECTION_LABELS[section.kind]} bölümünü aşağı taşı`} onClick={() => patch({ sections: moveStarterSection(state.sections, index, 1) })} disabled={disabled || index === state.sections.length - 1}><ArrowDown aria-hidden="true" /></button>
              <button type="button" aria-label={`${SECTION_LABELS[section.kind]} bölümünü kaldır`} onClick={() => patch({ sections: Object.freeze(state.sections.filter((_, position) => position !== index)) })} disabled={disabled || state.sections.length === 1}><Trash2 aria-hidden="true" /></button>
            </div></div>
            <label className={styles.check}><input type="checkbox" checked={section.enabled} onChange={(event) => updateSection(index, { ...section, enabled: event.currentTarget.checked })} disabled={disabled} /> Bölümü göster</label>
            {section.kind === "hero" ? <HeroSlidesEditor assets={assets} disabled={disabled} products={products} section={section} sectionIndex={index} update={(updated) => updateSection(index, updated)} /> : null}
            {section.kind === "category_grid" ? <><label>Başlık<input value={section.heading} maxLength={160} onChange={(event) => updateSection(index, { ...section, heading: event.currentTarget.value })} disabled={disabled} /></label><div className={styles.choiceGrid}>{categories.map((category) => <label className={styles.check} key={category.id}><input type="checkbox" checked={section.categoryIds.includes(category.id)} onChange={(event) => { const ids = event.currentTarget.checked ? [...section.categoryIds, category.id].slice(0, 8) : section.categoryIds.filter((id) => id !== category.id); updateSection(index, { ...section, categoryIds: Object.freeze(ids) }); }} disabled={disabled} />{category.name}</label>)}</div></> : null}
            {section.kind === "product_row" ? <div className={styles.fieldGrid}><label>Başlık<input value={section.heading} maxLength={160} onChange={(event) => updateSection(index, { ...section, heading: event.currentTarget.value })} disabled={disabled} /></label><label>Kaynak<select value={section.source} onChange={(event) => { const source = event.currentTarget.value as "latest" | "sale" | "category"; updateSection(index, source === "category" ? { ...section, source, categoryId: categories[0]?.id ?? "" } : { kind: "product_row", enabled: section.enabled, heading: section.heading, source, limit: section.limit }); }} disabled={disabled}><option value="latest">Yeni ürünler</option><option value="sale">İndirimdekiler</option><option value="category">Kategori</option></select></label>{section.source === "category" ? <label>Kategori<select value={section.categoryId} onChange={(event) => updateSection(index, { ...section, categoryId: event.currentTarget.value })} disabled={disabled}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label> : null}<label>Ürün sayısı<select value={section.limit} onChange={(event) => updateSection(index, { ...section, limit: Number(event.currentTarget.value) as 4 | 8 | 12 })} disabled={disabled}><option value="4">4</option><option value="8">8</option><option value="12">12</option></select></label></div> : null}
            {section.kind === "split_campaign" ? <SplitCampaignPanelsEditor assets={assets} disabled={disabled} section={section} sectionIndex={index} update={(updated) => updateSection(index, updated)} /> : null}
            {section.kind === "brand_story" ? <div className={styles.fieldGrid}><label>Başlık<input value={section.heading} maxLength={160} onChange={(event) => updateSection(index, { ...section, heading: event.currentTarget.value })} disabled={disabled} /></label><label className={styles.wide}>Metin<textarea value={section.body} maxLength={1000} onChange={(event) => updateSection(index, { ...section, body: event.currentTarget.value })} disabled={disabled} /></label></div> : null}
            {section.kind === "value_propositions" || section.kind === "testimonials" ? <StarterRetailSectionEditor disabled={disabled} section={section} update={(updated) => updateSection(index, updated)} /> : null}
          </li>)}</ol>
          <div className={styles.addBar}><label>Yeni bölüm<select value={newSection} onChange={(event) => setNewSection(event.currentTarget.value as SectionKind)} disabled={disabled}>{Object.entries(SECTION_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label><button type="button" onClick={addSection} disabled={disabled}><Plus aria-hidden="true" /> Bölüm ekle</button></div>
        </section> : null}
        {activePanel === "product" ? <fieldset className={styles.panel} disabled={disabled}><legend>Ürün detayı</legend><label>Galeri<select value={state.productDetail.galleryStyle} onChange={(event) => patch({ productDetail: { ...state.productDetail, galleryStyle: event.currentTarget.value as "grid" | "rail" } })}><option value="grid">Izgara</option><option value="rail">Kaydırmalı</option></select></label><label className={styles.check}><input type="checkbox" checked={state.cart.showQuantitySelector} onChange={(event) => patch({ cart: { ...state.cart, showQuantitySelector: event.currentTarget.checked } })} /> Ürün ve yan sepette miktar değiştirmeyi göster</label>{(["showSku", "showBrand", "showBreadcrumbs", "showRelatedProducts", "showApprovedReviews", "mobileStickyPurchase", "showSizeGuide"] as const).map((key) => <label className={styles.check} key={key}><input type="checkbox" checked={state.productDetail[key]} onChange={(event) => patch({ productDetail: { ...state.productDetail, [key]: event.currentTarget.checked } })} />{{ showSku: "SKU göster", showBrand: "Marka göster", showBreadcrumbs: "İçerik yolunu göster", showRelatedProducts: "Benzer ürünleri göster", showApprovedReviews: "Onaylı yorumlar", mobileStickyPurchase: "Mobil sabit satın alma", showSizeGuide: "Boyut rehberi" }[key]}</label>)}<p className={styles.label}>Ürün bilgi blokları</p>{(["description", "materials_and_care", "certifications", "shipping_and_returns"] as const).map((key) => <label className={styles.check} key={key}><input type="checkbox" checked={state.productDetail.informationSections.includes(key)} onChange={(event) => { const informationSections = event.currentTarget.checked ? [...state.productDetail.informationSections, key] : state.productDetail.informationSections.filter((item) => item !== key); if (informationSections.length) patch({ productDetail: { ...state.productDetail, informationSections: Object.freeze(informationSections) } }); }} />{{ description: "Açıklama", materials_and_care: "Malzeme ve bakım", certifications: "Sertifikalar", shipping_and_returns: "Kargo ve iade" }[key]}</label>)}</fieldset> : null}
        {activePanel === "cart" ? <fieldset className={styles.panel} disabled={disabled}><legend>Sepet deneyimi</legend><label className={styles.check}><input type="checkbox" checked={state.cart.showCheckoutReadiness} onChange={(event) => patch({ cart: { ...state.cart, showCheckoutReadiness: event.currentTarget.checked } })} /> Ödeme hazırlığını göster</label><label className={styles.check}><input type="checkbox" checked={false} aria-describedby="shipping-progress-authority" disabled /> Kargo ilerlemesini göster</label><p className={styles.fieldHelp} id="shipping-progress-authority">Kargo ilerlemesi için doğrulanmış ücretsiz kargo eşiği gerekli. Eşik authority’si sağlanana kadar bu seçenek kapalı kaydedilir ve vitrinde gösterilmez.</p><label>Güven mesajı<input maxLength={160} value={state.cart.trustMessage ?? ""} onChange={(event) => patch({ cart: { ...state.cart, trustMessage: event.currentTarget.value } })} /></label></fieldset> : null}
        {activePanel === "footer" ? <StarterFooterEditor categories={categories} disabled={disabled} pages={pages} update={(footer) => patch({ footer })} value={state.footer} /> : null}
        </section>
      </div>
      {showPreview !== false ? <aside className={styles.preview}>{preview ? <StarterThemePreview composition={preview} productTitles={productTitles} storefrontHostname={null} /> : <p role="alert">Önizleme için zorunlu alanları tamamlayın.</p>}</aside> : null}
    </form>}
  </main>;
}
