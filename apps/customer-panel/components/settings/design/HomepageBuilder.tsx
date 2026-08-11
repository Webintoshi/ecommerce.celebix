"use client";

import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeStarterThemeCompositionV3,
  type HomepageSectionId,
  type StarterThemeCompositionConfigV3,
  type StarterThemeSectionConfigV3,
  type StorefrontDesignDestinationOption,
  type StorefrontDesignDocument,
  type StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";

import {
  addHomepageSection,
  duplicateHomepageSection,
  moveHomepageSection,
  removeHomepageSection,
  restoreRemovedHomepageSection,
  setHomepageSectionVisibility,
  updateHomepageSection,
  type HomepageUndo,
} from "./homepage-command-model";
import { scoreHomepageQuality } from "./homepage-quality-model";
import styles from "../design-settings.module.css";

type BodySectionKind = Exclude<StarterThemeSectionConfigV3["kind"], "hero">;

const SECTION_LIBRARY = Object.freeze([
  Object.freeze({ kind: "category_grid", label: "Kategori vitrini", hint: "Müşteriler kategorileri görerek keşfeder." }),
  Object.freeze({ kind: "product_row", label: "Ürün bölümü", hint: "Yeni, indirimli veya kategori ürünlerini gösterir." }),
  Object.freeze({ kind: "split_campaign", label: "İkili kampanya", hint: "Yan yana iki güçlü görsel bağlantı sunar." }),
  Object.freeze({ kind: "brand_story", label: "Marka hikâyesi", hint: "Mağazanızı kısa bir metin ve görselle anlatır." }),
  Object.freeze({ kind: "value_propositions", label: "Değer önerileri", hint: "Teslimat, güven ve iade vaatlerini açıklar." }),
  Object.freeze({ kind: "testimonials", label: "Müşteri yorumları", hint: "Yalnız onaylanmış ürün yorumlarını gösterir." }),
] satisfies readonly Readonly<{ kind: BodySectionKind; label: string; hint: string }>[]);

const SECTION_LABEL: Readonly<Record<BodySectionKind, string>> = Object.freeze(Object.fromEntries(SECTION_LIBRARY.map(({ kind, label }) => [kind, label])) as Record<BodySectionKind, string>);

function nextSectionId(kind: BodySectionKind): HomepageSectionId {
  const unique = globalThis.crypto.randomUUID().replaceAll("-", "_");
  return `home_${kind}_${unique}` as HomepageSectionId;
}

function sectionSummary(section: StarterThemeSectionConfigV3): string {
  if (section.kind === "category_grid") return section.categoryIds.length ? `${section.categoryIds.length} kategori` : "Kategori seçilmedi";
  if (section.kind === "product_row") return `${section.limit} ürün · ${section.source === "latest" ? "Yeni" : section.source === "sale" ? "İndirimli" : "Kategori"}`;
  if (section.kind === "split_campaign") return section.panels.length ? `${section.panels.length} kampanya` : "Kampanya seçilmedi";
  if (section.kind === "brand_story") return section.heading;
  if (section.kind === "value_propositions") return `${section.items.length} değer`;
  if (section.kind === "testimonials") return `${section.limit} onaylı yorum`;
  return "Ana banner";
}

function HomepageSectionFields({ section, media, destinations, disabled, onUpdate }: Readonly<{
  section: StarterThemeSectionConfigV3;
  media: readonly StorefrontDesignMediaOption[];
  destinations: readonly StorefrontDesignDestinationOption[];
  disabled: boolean;
  onUpdate: (next: StarterThemeSectionConfigV3) => void;
}>) {
  const categories = destinations.filter(({ kind }) => kind === "collection");
  const paths = destinations.map(({ path, label }) => ({ path, label }));
  if (section.kind === "category_grid") return <div className={styles.homepageInspectorFields}>
    <label>Başlık<input disabled={disabled} value={section.heading} onChange={(event) => onUpdate({ ...section, heading: event.target.value })} /></label>
    <fieldset><legend>Görseller nasıl dizilsin?</legend><div className={styles.homepageChoiceGrid}>
      {(["duo", "grid"] as const).map((layout) => <label key={layout}><input type="radio" disabled={disabled} checked={section.layout === layout} onChange={() => onUpdate({ ...section, layout })} /><span><b>{layout === "duo" ? "İki büyük görsel" : "Düzenli ızgara"}</b><small>{layout === "duo" ? "Masaüstünde iki, telefonda alt alta." : "Masaüstünde dört, telefonda iki sütun."}</small></span></label>)}
    </div></fieldset>
    <fieldset><legend>Gösterilecek kategoriler</legend><div className={styles.homepageCheckList}>{categories.map((category) => <label key={category.resourceId}><input type="checkbox" disabled={disabled} checked={section.categoryIds.includes(category.resourceId)} onChange={(event) => onUpdate({ ...section, categoryIds: event.target.checked ? [...section.categoryIds, category.resourceId] : section.categoryIds.filter((id) => id !== category.resourceId) })} /><span>{category.label}</span></label>)}</div></fieldset>
  </div>;

  if (section.kind === "product_row") return <div className={styles.homepageInspectorFields}>
    <label>Başlık<input disabled={disabled} value={section.heading} onChange={(event) => onUpdate({ ...section, heading: event.target.value })} /></label>
    <label>Hangi ürünler?<select disabled={disabled} value={section.source} onChange={(event) => {
      const source = event.target.value as "latest" | "sale" | "category";
      onUpdate(source === "category" ? { ...section, source, categoryId: section.categoryId ?? categories[0]?.resourceId ?? "" } : { kind: section.kind, sectionId: section.sectionId, enabled: section.enabled, heading: section.heading, source, limit: section.limit });
    }}><option value="latest">Yeni ürünler</option><option value="sale">İndirimli ürünler</option><option value="category">Bir kategori</option></select></label>
    {section.source === "category" ? <label>Kategori<select disabled={disabled} value={section.categoryId ?? ""} onChange={(event) => onUpdate({ ...section, categoryId: event.target.value })}><option value="">Kategori seçin</option>{categories.map((category) => <option key={category.resourceId} value={category.resourceId}>{category.label}</option>)}</select></label> : null}
    <label>Ürün sayısı<select disabled={disabled} value={section.limit} onChange={(event) => onUpdate({ ...section, limit: Number(event.target.value) as 4 | 8 | 12 })}><option value="4">4</option><option value="8">8</option><option value="12">12</option></select></label>
  </div>;

  if (section.kind === "split_campaign") return <div className={styles.homepageInspectorFields}>
    <p className={styles.homepageHelp}>En fazla iki kampanya kartı ekleyin. Görsel ve bağlantı birlikte seçilir.</p>
    {[0, 1].map((index) => {
      const panel = section.panels[index];
      return <fieldset key={index}><legend>{index + 1}. kampanya</legend>
        <label>Başlık<input disabled={disabled} value={panel?.heading ?? ""} onChange={(event) => { const panels = [...section.panels]; panels[index] = { eyebrow: panel?.eyebrow, heading: event.target.value, body: panel?.body, assetId: panel?.assetId ?? media[0]?.id ?? "", destination: panel?.destination ?? paths[0]?.path ?? "/" }; onUpdate({ ...section, panels }); }} /></label>
        <label>Görsel<select disabled={disabled} value={panel?.assetId ?? ""} onChange={(event) => { const panels = [...section.panels]; panels[index] = { heading: panel?.heading ?? `Kampanya ${index + 1}`, assetId: event.target.value, destination: panel?.destination ?? paths[0]?.path ?? "/" }; onUpdate({ ...section, panels }); }}><option value="">Görsel seçin</option>{media.map((item) => <option key={item.id} value={item.id}>{item.altText}</option>)}</select></label>
        <label>Bağlantı<select disabled={disabled} value={panel?.destination ?? ""} onChange={(event) => { const panels = [...section.panels]; panels[index] = { heading: panel?.heading ?? `Kampanya ${index + 1}`, assetId: panel?.assetId ?? media[0]?.id ?? "", destination: event.target.value }; onUpdate({ ...section, panels }); }}><option value="">Bağlantı seçin</option>{paths.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
      </fieldset>;
    })}
  </div>;

  if (section.kind === "brand_story") return <div className={styles.homepageInspectorFields}>
    <label>Küçük başlık<input disabled={disabled} value={section.eyebrow ?? ""} onChange={(event) => onUpdate({ ...section, eyebrow: event.target.value })} /></label>
    <label>Başlık<input disabled={disabled} value={section.heading} onChange={(event) => onUpdate({ ...section, heading: event.target.value })} /></label>
    <label>Hikâye<textarea disabled={disabled} value={section.body} onChange={(event) => onUpdate({ ...section, body: event.target.value })} /></label>
    <label>Görsel<select disabled={disabled} value={section.assetId ?? ""} onChange={(event) => onUpdate({ ...section, assetId: event.target.value || undefined })}><option value="">Görselsiz</option>{media.map((item) => <option key={item.id} value={item.id}>{item.altText}</option>)}</select></label>
    <label>Bağlantı<select disabled={disabled} value={section.destination ?? ""} onChange={(event) => onUpdate({ ...section, destination: event.target.value || undefined })}><option value="">Bağlantı yok</option>{paths.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
  </div>;

  if (section.kind === "value_propositions") return <div className={styles.homepageInspectorFields}>
    <p className={styles.homepageHelp}>Müşterinizin göreceği gerçek mağaza vaatlerini yazın.</p>
    {section.items.map((item, index) => <fieldset key={index}><legend>{index + 1}. değer</legend>
      <label>Simge<select disabled={disabled} value={item.icon} onChange={(event) => { const items = [...section.items]; items[index] = { ...item, icon: event.target.value as typeof item.icon }; onUpdate({ ...section, items }); }}>{["sparkles", "cotton", "heart", "shield", "truck", "return"].map((icon) => <option key={icon} value={icon}>{icon === "shield" ? "Güven" : icon === "truck" ? "Teslimat" : icon === "return" ? "İade" : icon === "heart" ? "Özen" : icon === "cotton" ? "Malzeme" : "Öne çıkan"}</option>)}</select></label>
      <label>Başlık<input disabled={disabled} value={item.heading} onChange={(event) => { const items = [...section.items]; items[index] = { ...item, heading: event.target.value }; onUpdate({ ...section, items }); }} /></label>
      <label>Açıklama<input disabled={disabled} value={item.body} onChange={(event) => { const items = [...section.items]; items[index] = { ...item, body: event.target.value }; onUpdate({ ...section, items }); }} /></label>
    </fieldset>)}
  </div>;

  if (section.kind === "testimonials") return <div className={styles.homepageInspectorFields}>
    <label>Başlık<input disabled={disabled} value={section.heading} onChange={(event) => onUpdate({ ...section, heading: event.target.value })} /></label>
    <label>Yorum sayısı<select disabled={disabled} value={section.limit} onChange={(event) => onUpdate({ ...section, limit: Number(event.target.value) as 3 | 6 | 9 })}><option value="3">3</option><option value="6">6</option><option value="9">9</option></select></label>
    <label>En düşük puan<select disabled={disabled} value={section.minimumRating} onChange={(event) => onUpdate({ ...section, minimumRating: Number(event.target.value) as 4 | 5 })}><option value="4">4 yıldız</option><option value="5">5 yıldız</option></select></label>
    <p className={styles.homepageHelp}>Sahte metin eklenmez; yalnız mağazanıza ait onaylanmış ürün yorumları gösterilir.</p>
  </div>;
  return null;
}

export function HomepageBuilder({ design, media, destinations, canManage, previewMode, onChange }: Readonly<{
  design: StorefrontDesignDocument;
  media: readonly StorefrontDesignMediaOption[];
  destinations: readonly StorefrontDesignDestinationOption[];
  canManage: boolean;
  previewMode: "desktop" | "mobile";
  onChange: (design: StorefrontDesignDocument) => void;
}>) {
  const composition = useMemo(() => normalizeStarterThemeCompositionV3(design.composition), [design.composition]);
  const quality = useMemo(() => scoreHomepageQuality({ design, media, destinations }), [design, media, destinations]);
  const [selectedId, setSelectedId] = useState<HomepageSectionId | null>(null);
  const [undo, setUndo] = useState<HomepageUndo | null>(null);
  const draggedId = useRef<HomepageSectionId | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const selected = composition.sections.find(({ sectionId }) => sectionId === selectedId);
  const changeComposition = (next: StarterThemeCompositionConfigV3) => onChange({ ...design, composition: next });
  const update = (section: StarterThemeSectionConfigV3) => changeComposition(updateHomepageSection(composition, section.sectionId, section));
  const closeInspector = () => {
    setSelectedId(null);
    globalThis.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (selectedId !== null) inspectorRef.current?.focus();
  }, [selectedId]);

  return <div className={styles.homepageBuilder} data-preview-mode={previewMode}>
    <section className={styles.homepageQuality} aria-label="Ana sayfa kalite puanı">
      <div className={styles.homepageScore}><strong>{quality.score}</strong><span>/ 100</span></div>
      <div><span>KALİTE PUANI</span><h3>{quality.label}</h3><p>{quality.score === 100 ? "Çok başarılı bir ana sayfa oluşturdunuz." : quality.recommendations[0]?.message ?? "Ana sayfanızı geliştirmeye devam edin."}</p></div>
      <progress max="100" value={quality.score}>{quality.score}</progress>
    </section>

    <section className={styles.homepageFixedHero}>
      <div><span>1</span><div><b>Ana banner</b><small>Her zaman ilk sıradadır ve taşınamaz.</small></div></div>
      <span className={design.hero.enabled ? styles.homepageReady : styles.homepageMuted}>{design.hero.enabled ? "Açık" : "Kapalı"}</span>
    </section>

    <ol className={styles.homepageMobileSteps} aria-label="Mobil ana sayfa düzenleme adımları"><li>Bölüm ekle</li><li>Sırala</li><li>Düzenle</li></ol>
    <p className={styles.homepageLive} aria-live="polite">Ana sayfada {composition.sections.length} düzenlenebilir bölüm var. Kalite puanı {quality.score}.</p>

    <section className={styles.homepageCanvas} aria-labelledby="homepage-sections-heading">
      <header><div><span>ANA SAYFA</span><h3 id="homepage-sections-heading">Bölümlerinizi sıralayın</h3><p>Kartları sürükleyin veya okları kullanın. Değişiklikler otomatik kaydedilir.</p></div><b>{composition.sections.length} / 12 bölüm</b></header>
      {composition.sections.length === 0 ? <div className={styles.homepageEmpty}><strong>Ana sayfanız şu anda boş</strong><p>Aşağıdan bir bölüm ekleyin. Boş ana sayfa güvenli şekilde açılmaya devam eder.</p></div> : <ol className={styles.homepageSectionList}>
        {composition.sections.map((section, index) => <li
          key={section.sectionId}
          draggable={canManage}
          onDragStart={() => { draggedId.current = section.sectionId; }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => { if (draggedId.current && draggedId.current !== section.sectionId) changeComposition(moveHomepageSection(composition, draggedId.current, index)); draggedId.current = null; }}
          className={!section.enabled ? styles.homepageSectionDisabled : undefined}
        >
          <button type="button" className={styles.homepageSectionMain} disabled={!canManage} onClick={(event) => { returnFocusRef.current = event.currentTarget; setSelectedId(section.sectionId); }} aria-label={`${SECTION_LABEL[section.kind as BodySectionKind]} bölümünü düzenle`}>
            <GripVertical size={18} aria-hidden="true" /><span>{index + 2}</span><div><b>{SECTION_LABEL[section.kind as BodySectionKind]}</b><small>{sectionSummary(section)}</small></div>
          </button>
          <div className={styles.homepageSectionActions}>
            <button type="button" disabled={!canManage || index === 0} onClick={() => changeComposition(moveHomepageSection(composition, section.sectionId, index - 1))} aria-label="Yukarı taşı"><ChevronUp size={17} /></button>
            <button type="button" disabled={!canManage || index === composition.sections.length - 1} onClick={() => changeComposition(moveHomepageSection(composition, section.sectionId, index + 1))} aria-label="Aşağı taşı"><ChevronDown size={17} /></button>
            <button type="button" disabled={!canManage} onClick={() => changeComposition(setHomepageSectionVisibility(composition, section.sectionId, !section.enabled))} aria-label={section.enabled ? "Gizle" : "Göster"}>{section.enabled ? <Eye size={17} /> : <EyeOff size={17} />}</button>
            {section.kind === "product_row" ? <button type="button" disabled={!canManage} onClick={() => changeComposition(duplicateHomepageSection(composition, section.sectionId, nextSectionId("product_row")))} aria-label="Çoğalt"><Copy size={17} /></button> : null}
            <button type="button" disabled={!canManage} onClick={() => { const removed = removeHomepageSection(composition, section.sectionId); setUndo(removed.undo); changeComposition(removed.composition); }} aria-label="Sil"><Trash2 size={17} /></button>
          </div>
        </li>)}
      </ol>}
      {undo ? <button type="button" className={styles.homepageUndo} onClick={() => { changeComposition(restoreRemovedHomepageSection(undo)); setUndo(null); }}><RotateCcw size={16} />Geri al</button> : null}
    </section>

    <section className={styles.homepageLibrary} aria-labelledby="homepage-library-heading">
      <header><span>BÖLÜM EKLE</span><h3 id="homepage-library-heading">Ne göstermek istersiniz?</h3><p>Bir karta basın; bölüm ana sayfanın sonuna eklenir.</p></header>
      <div>{SECTION_LIBRARY.map((item) => {
        const singletonExists = item.kind !== "product_row" && composition.sections.some(({ kind }) => kind === item.kind);
        const productLimit = item.kind === "product_row" && composition.sections.filter(({ kind }) => kind === "product_row").length >= 4;
        return <button type="button" key={item.kind} disabled={!canManage || singletonExists || productLimit || composition.sections.length >= 12} onClick={() => changeComposition(addHomepageSection(composition, item.kind, nextSectionId(item.kind)))}><Plus size={18} /><span><b>{item.label}</b><small>{singletonExists ? "Zaten eklendi" : productLimit ? "En fazla 4 ürün bölümü" : item.hint}</small></span></button>;
      })}</div>
    </section>

    {selected ? <>
      <button type="button" className={styles.homepageInspectorBackdrop} onClick={closeInspector} aria-label="Bölüm düzenleyiciyi kapat" />
      <section ref={inspectorRef} tabIndex={-1} className={styles.homepageSectionInspector} role="dialog" aria-modal="true" aria-labelledby="homepage-section-editor-heading" onKeyDown={(event) => { if (event.key === "Escape") closeInspector(); }}>
        <header><div><span>BÖLÜMÜ DÜZENLE</span><h3 id="homepage-section-editor-heading">{SECTION_LABEL[selected.kind as BodySectionKind]}</h3></div><button type="button" onClick={closeInspector} aria-label="Bölüm düzenleyiciyi kapat">×</button></header>
        <HomepageSectionFields section={selected} media={media} destinations={destinations} disabled={!canManage} onUpdate={update} />
        <footer><button type="button" onClick={closeInspector}>Bitti</button></footer>
      </section>
    </> : null}
  </div>;
}
