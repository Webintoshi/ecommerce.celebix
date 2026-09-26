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
  type StorefrontDesignAssetOption,
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
import { effectiveHeroEnabled } from "./design-editor-model";
import { HomepageSectionFields, sectionFieldErrors } from "./HomepageSectionFields";
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

const SECTION_LABEL: Readonly<Record<StarterThemeSectionConfigV3["kind"], string>> = Object.freeze({ ...Object.fromEntries(SECTION_LIBRARY.map(({ kind, label }) => [kind, label])) as Record<BodySectionKind, string>, hero: "Eski banner kaydı" });

function nextSectionId(kind: BodySectionKind): HomepageSectionId {
  const unique = globalThis.crypto.randomUUID().replaceAll("-", "_");
  return `home_${kind}_${unique}` as HomepageSectionId;
}

function sectionSummary(section: StarterThemeSectionConfigV3): string {
  if (section.kind === "category_grid") return section.categoryIds.length ? `${section.categoryIds.length} kategori` : "Kategori seçilmedi";
  if (section.kind === "product_row") return section.source === "manual" ? `${section.productIds?.length ?? 0} seçili ürün` : `${section.limit} ürün · ${section.source === "latest" ? "Yeni" : section.source === "sale" ? "İndirimli" : "Kategori"}`;
  if (section.kind === "split_campaign") return section.panels.length ? `${section.panels.length} kampanya` : "Kampanya seçilmedi";
  if (section.kind === "brand_story") return section.heading;
  if (section.kind === "value_propositions") return `${section.items.length} değer`;
  if (section.kind === "testimonials") return `${section.limit} onaylı yorum`;
  return "Önceki tasarımdan kalan banner kaydı";
}


type TemporarySectionInput = Readonly<{ baseline: StarterThemeSectionConfigV3; section: StarterThemeSectionConfigV3 }>;

// Replay only uncommitted field edits on the current section. Visibility and
// other fields can change through the section list, restoration, or recovery.
function rebaseTemporaryInput(baseline: unknown, input: unknown, latest: unknown): unknown {
  if (JSON.stringify(baseline) === JSON.stringify(input)) return latest;
  if (Array.isArray(baseline) && Array.isArray(input) && Array.isArray(latest)) {
    // A field edit does not undo items added or removed by a restored document.
    if (baseline.length === input.length) return latest.map((item, index) => index < input.length ? rebaseTemporaryInput(baseline[index], input[index], item) : item);
    return input.map((item, index) => rebaseTemporaryInput(baseline[index], item, latest[index]));
  }
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (record(input) && record(latest) && (baseline === undefined || record(baseline))) {
    const previous = record(baseline) ? baseline : {};
    const result = { ...latest };
    for (const key of new Set([...Object.keys(previous), ...Object.keys(input)])) {
      if (JSON.stringify(previous[key]) === JSON.stringify(input[key])) continue;
      if (Object.hasOwn(input, key)) result[key] = rebaseTemporaryInput(previous[key], input[key], latest[key]);
      else delete result[key];
    }
    return result;
  }
  return input;
}

function currentSectionInput(input: TemporarySectionInput | null, latest: StarterThemeSectionConfigV3): StarterThemeSectionConfigV3 {
  if (!input || input.section.sectionId !== latest.sectionId || input.section.kind !== latest.kind) return latest;
  return rebaseTemporaryInput(input.baseline, input.section, latest) as StarterThemeSectionConfigV3;
}

export function HomepageBuilder({ design, media, assets = [], destinations, canManage, previewMode, onChange }: Readonly<{
  design: StorefrontDesignDocument;
  media: readonly StorefrontDesignMediaOption[];
  assets?: readonly StorefrontDesignAssetOption[];
  destinations: readonly StorefrontDesignDestinationOption[];
  canManage: boolean;
  previewMode: "desktop" | "mobile";
  onChange: (design: StorefrontDesignDocument) => void;
}>) {
  const composition = useMemo(() => normalizeStarterThemeCompositionV3(design.composition), [design.composition]);
  const quality = useMemo(() => scoreHomepageQuality({ design, media, assets, destinations }), [design, media, assets, destinations]);
  const [selectedId, setSelectedId] = useState<HomepageSectionId | null>(null);
  const [undo, setUndo] = useState<HomepageUndo | null>(null);
  const draggedId = useRef<HomepageSectionId | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [editorDraft, setEditorDraft] = useState<TemporarySectionInput | null>(null);
  const [commandError, setCommandError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string,string>>>({});
  const persistedSelected = composition.sections.find(({ sectionId }) => sectionId === selectedId);
  const selected = persistedSelected ? currentSectionInput(editorDraft, persistedSelected) : undefined;
  const heroEnabled=effectiveHeroEnabled(design);
  const heroHasImage=design.hero.enabled ? design.hero.slides.some(slide=>slide.enabled&&slide.desktopImage) : composition.sections.some(section=>section.kind==="hero"&&section.enabled&&section.slides.length>0);
  const productRowCount = composition.sections.filter(({kind}) => kind === "product_row").length;
  const runCommand = (command: () => StarterThemeCompositionConfigV3) => {
    try { changeComposition(command()); setCommandError(""); } catch { setCommandError("Bölüm değiştirilemedi. Bölüm sınırlarını kontrol edin; taslak korunuyor."); }
  };
  const changeComposition = (next: StarterThemeCompositionConfigV3) => onChange({ ...design, composition: next });
  const update = (section: StarterThemeSectionConfigV3) => {
    setEditorDraft({ baseline: persistedSelected ?? section, section });
    const errors = sectionFieldErrors(section);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    try { changeComposition(updateHomepageSection(composition, section.sectionId, section)); setEditorDraft(null); setCommandError(""); }
    catch { setFieldErrors({ form: "Alanı kontrol edin. Son geçerli taslak korunuyor." }); }
  };
  const closeInspector = () => {
    setSelectedId(null);
    setEditorDraft(null);
    setFieldErrors({});
    globalThis.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (selectedId === null) return;
    if (!persistedSelected) { setSelectedId(null); setEditorDraft(null); setFieldErrors({}); }
    else if (editorDraft && editorDraft.section.kind !== persistedSelected.kind) { setEditorDraft(null); setFieldErrors({}); }
  }, [selectedId, persistedSelected, editorDraft]);

  useEffect(() => {
    if (selectedId !== null) inspectorRef.current?.focus();
    inspectorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  return <div className={styles.homepageBuilder} data-preview-mode={previewMode}>
    {commandError ? <p role="alert" className={styles.fieldError}>{commandError}</p> : null}
    <section className={styles.homepageQuality} aria-label="Ana sayfa kalite puanı">
      <div className={styles.homepageScore}><strong>{quality.score}</strong><span>/ 100</span></div>
      <div><span>KALİTE PUANI</span><h3>{quality.label}</h3><p>{quality.score === 100 ? "Çok başarılı bir ana sayfa oluşturdunuz." : quality.recommendations[0]?.message ?? "Ana sayfanızı geliştirmeye devam edin."}</p></div>
      <progress max="100" value={quality.score}>{quality.score}</progress>
    </section>

    <section className={styles.homepageFixedHero}>
      <div><span>1</span><div><b>Ana banner</b><small>Her zaman ilk sıradadır ve taşınamaz.</small></div></div>
      <span className={heroEnabled && heroHasImage ? styles.homepageReady : styles.homepageMuted}>{!heroEnabled ? "Kapalı" : heroHasImage ? "Taslakta açık" : "Gösterilecek banner yok"}</span>
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
          <button type="button" className={styles.homepageSectionMain} disabled={!canManage} onClick={(event) => { returnFocusRef.current = event.currentTarget; setEditorDraft(null); setFieldErrors({}); setSelectedId(section.sectionId); }} aria-label={`${SECTION_LABEL[section.kind]} bölümünü düzenle`}>
            <GripVertical size={18} aria-hidden="true" /><span>{index + 2}</span><div><b>{SECTION_LABEL[section.kind]}</b><small>{sectionSummary(section)}</small></div>
          </button>
          <div className={styles.homepageSectionActions}>
            <button type="button" disabled={!canManage || index === 0} onClick={() => changeComposition(moveHomepageSection(composition, section.sectionId, index - 1))} aria-label="Yukarı taşı"><ChevronUp size={17} /></button>
            <button type="button" disabled={!canManage || index === composition.sections.length - 1} onClick={() => changeComposition(moveHomepageSection(composition, section.sectionId, index + 1))} aria-label="Aşağı taşı"><ChevronDown size={17} /></button>
            <button type="button" disabled={!canManage} onClick={() => changeComposition(setHomepageSectionVisibility(composition, section.sectionId, !section.enabled))} aria-label={section.enabled ? "Gizle" : "Göster"}>{section.enabled ? <Eye size={17} /> : <EyeOff size={17} />}</button>
            {section.kind === "product_row" ? <button type="button" disabled={!canManage || productRowCount >= 4 || composition.sections.length >= 12} title={productRowCount >= 4 ? "En fazla 4 ürün bölümü" : undefined} onClick={() => runCommand(() => duplicateHomepageSection(composition, section.sectionId, nextSectionId("product_row")))} aria-label="Çoğalt"><Copy size={17} /></button> : null}
            <button type="button" disabled={!canManage} onClick={() => { const removed = removeHomepageSection(composition, section.sectionId); setUndo(removed.undo); changeComposition(removed.composition); }} aria-label="Sil"><Trash2 size={17} /></button>
          </div>
        </li>)}
      </ol>}
      {undo ? <button type="button" className={styles.homepageUndo} onClick={() => { try { changeComposition(restoreRemovedHomepageSection(composition, undo)); setUndo(null); setCommandError(""); } catch { setCommandError("Bölüm geri getirilemedi. Aynı türden bölüm veya bölüm sınırı çakışıyor; son değişiklikleriniz korundu."); } }}><RotateCcw size={16} />Geri al</button> : null}
    </section>

    <section className={styles.homepageLibrary} aria-labelledby="homepage-library-heading">
      <header><span>BÖLÜM EKLE</span><h3 id="homepage-library-heading">Ne göstermek istersiniz?</h3><p>Bir karta basın; bölüm ana sayfanın sonuna eklenir.</p></header>
      <div>{SECTION_LIBRARY.map((item) => {
        const singletonExists = item.kind !== "product_row" && composition.sections.some(({ kind }) => kind === item.kind);
        const productLimit = item.kind === "product_row" && composition.sections.filter(({ kind }) => kind === "product_row").length >= 4;
        return <button type="button" key={item.kind} disabled={!canManage || singletonExists || productLimit || composition.sections.length >= 12} onClick={() => runCommand(() => addHomepageSection(composition, item.kind, nextSectionId(item.kind)))}><Plus size={18} /><span><b>{item.label}</b><small>{singletonExists ? "Zaten eklendi" : productLimit ? "En fazla 4 ürün bölümü" : item.hint}</small></span></button>;
      })}</div>
    </section>

    {selected ? <>
      <section ref={inspectorRef} tabIndex={-1} className={styles.homepageSectionInspector} role="region" aria-labelledby="homepage-section-editor-heading" onKeyDownCapture={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeInspector(); } }}>
        <header><div><span>BÖLÜMÜ DÜZENLE</span><h3 id="homepage-section-editor-heading">{SECTION_LABEL[selected.kind]}</h3></div><button type="button" onClick={closeInspector} aria-label="Bölüm düzenleyiciyi kapat">×</button></header>
        <HomepageSectionFields section={selected} assets={assets} destinations={destinations} disabled={!canManage} errors={fieldErrors} onUpdate={update} />
        <footer>{fieldErrors.form ? <p className={styles.fieldError} role="alert">{fieldErrors.form}</p> : null}{Object.keys(fieldErrors).length ? <button type="button" className={styles.homepageDiscard} onClick={closeInspector}>Geçici girişi bırak</button> : null}<button type="button" disabled={Object.keys(fieldErrors).length > 0} onClick={closeInspector}>Bitti</button></footer>
      </section>
    </> : null}
  </div>;
}
