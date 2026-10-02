"use client";

import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ReferenceIdentity } from "@celebix/saas-contracts";
import type { ReferenceImpactEntry, ReferenceImpactPreview, ReferenceSetDetail, ReferenceSetList } from "@celebix/saas-data";

import { PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { referencePricingApi, referencePricingErrorState } from "@/lib/reference-pricing-ui/client";
import { parseTurkishPricingDecimal } from "@/lib/reference-pricing-ui/decimal";
import { buildReferenceSetValues, canActivateReferenceSet, type ReferenceRateDraft } from "@/lib/reference-pricing-ui/model";
import styles from "./reference-pricing.module.css";

type Phase = "loading" | "ready" | "error";
type PreviewPhase = "idle" | "loading" | "ready" | "error";
type Kind = "usd" | "eur" | "gold_gram";
type WorkspaceTab = "references" | "preview" | "history";
const WORKSPACE_TABS = Object.freeze([
  { id: "references", label: "Referanslar" },
  { id: "preview", label: "Fiyat önizlemesi" },
  { id: "history", label: "Sürüm geçmişi" },
] as const);

const KIND_LABEL: Record<Kind, string> = { usd: "ABD doları", eur: "Euro", gold_gram: "Gram altın" };
const fmtDate = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
function formatCents(cents: number | null): string {
  if (cents === null) return "Hesaplanamıyor";
  const exact = BigInt(cents);
  return `${new Intl.NumberFormat("tr-TR").format(exact / 100n)},${String(exact % 100n).padStart(2, "0")} ₺`;
}
const displayDecimal = (canonical: string | null | undefined) => canonical?.replace(".", ",") ?? "";

function messageForFailure(failure: unknown, write: boolean): string {
  const state = referencePricingErrorState(failure);
  if (state === "conflict") return "Başka bir yönetici fiyatlandırmayı değiştirdi. Girdiğiniz değerler korundu; güncel sürümü yükleyip yeniden değerlendirin.";
  if (state === "verification_unavailable") return "Kaydın sonucu doğrulanamıyor. Yeni işlem göndermeyin; sayfayı tamamen yenileyerek sunucudaki durumu kontrol edin.";
  if (state === "denied") return "Bu fiyatlandırma işlemi için yetkiniz yok.";
  if (state === "not_found") return "İlgili fiyatlandırma kaydı artık bulunmuyor. Güncel listeyi yükleyin.";
  return write ? "İşlem tamamlanamadı. Girdiğiniz değerler korundu; bağlantıyı kontrol edip yeniden deneyin." : "Fiyatlandırma verileri yüklenemedi. Bağlantıyı kontrol edip yeniden deneyin.";
}

export function ReferencePricingConsole({ canRead, canManage }: Readonly<{ canRead: boolean; canManage: boolean }>) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [definitions, setDefinitions] = useState<readonly ReferenceIdentity[]>([]);
  const [listing, setListing] = useState<ReferenceSetList | null>(null);
  const [activeSet, setActiveSet] = useState<ReferenceSetDetail | null>(null);
  const [historyDetail, setHistoryDetail] = useState<ReferenceSetDetail | null>(null);
  const [rates, setRates] = useState<readonly ReferenceRateDraft[]>([]);
  const [savedSet, setSavedSet] = useState<ReferenceSetDetail | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("idle");
  const [preview, setPreview] = useState<ReferenceImpactPreview | null>(null);
  const [previewEntries, setPreviewEntries] = useState<readonly ReferenceImpactEntry[]>([]);
  const [previewCursor, setPreviewCursor] = useState<string | null>(null);
  const [channel, setChannel] = useState<"storefront" | "quick_order">("storefront");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [locked, setLocked] = useState(false);
  const [kind, setKind] = useState<Kind>("usd");
  const [referenceLabel, setReferenceLabel] = useState("USD satış");
  const [purityText, setPurityText] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("references");
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [bindCatalogGrams, setBindCatalogGrams] = useState(false);
  const [catalogGramReferenceId, setCatalogGramReferenceId] = useState("");
  const previewGeneration = useRef(0);
  const definitionDialogRef = useRef<HTMLDialogElement>(null);
  const definitionTriggerRef = useRef<HTMLButtonElement>(null);
  const goldReferences = definitions.filter((definition) => definition.kind === "gold_gram");
  const catalogGramChoice = bindCatalogGrams && goldReferences.some((definition) => definition.id === catalogGramReferenceId)
    ? catalogGramReferenceId : undefined;
  const gramChoiceMissing = bindCatalogGrams && !catalogGramChoice;

  useEffect(() => {
    const dialog = definitionDialogRef.current;
    if (!definitionOpen || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => definitionTriggerRef.current?.focus());
    };
  }, [definitionOpen]);

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, selected: WorkspaceTab) {
    const index = WORKSPACE_TABS.findIndex(({ id }) => id === selected);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % WORKSPACE_TABS.length
      : event.key === "ArrowLeft" ? (index + WORKSPACE_TABS.length - 1) % WORKSPACE_TABS.length
        : event.key === "Home" ? 0 : event.key === "End" ? WORKSPACE_TABS.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = WORKSPACE_TABS[nextIndex]!;
    setWorkspaceTab(next.id);
    document.getElementById(`pricing-tab-${next.id}`)?.focus();
  }

  const reload = useCallback(async (preserveDraft = false, signal?: AbortSignal) => {
    setPhase("loading");
    setProblem("");
    try {
      const [nextDefinitions, nextListing] = await Promise.all([
        referencePricingApi.listDefinitions(signal), referencePricingApi.listSets({ pageSize: 20 }, signal),
      ]);
      const nextActive = nextListing.activeSetId ? await referencePricingApi.getSet(nextListing.activeSetId, signal) : null;
      if (signal?.aborted) return;
      setDefinitions(nextDefinitions.items);
      setListing(nextListing);
      setActiveSet(nextActive);
      setRates((previous) => nextDefinitions.items.map((definition) => {
        const existing = preserveDraft ? previous.find((item) => item.referenceId === definition.id) : undefined;
        const active = nextActive?.values.find((item) => item.referenceId === definition.id);
        return existing ?? { referenceId: definition.id, rateText: displayDecimal(active?.rateTry), active: active?.active ?? false };
      }));
      if (!preserveDraft) {
        setSavedSet(null);
        setDraftDirty(false);
        clearReferencePreview();
      }
      setPhase("ready");
    } catch (failure) {
      if (signal?.aborted) return;
      setProblem(messageForFailure(failure, false));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    void reload(false, controller.signal);
    return () => controller.abort();
  }, [canRead, reload]);

  useEffect(() => {
    if (kind === "gold_gram" || !definitions.some((item) => item.kind === kind)) return;
    const next: Kind = definitions.some((item) => item.kind === "usd")
      ? definitions.some((item) => item.kind === "eur") ? "gold_gram" : "eur"
      : "usd";
    setKind(next);
    setReferenceLabel(next === "usd" ? "USD satış" : next === "eur" ? "EUR satış" : "Gram altın satış");
  }, [definitions, kind]);

  function clearReferencePreview() {
    previewGeneration.current += 1;
    setPreview(null);
    setPreviewEntries([]);
    setPreviewCursor(null);
    setPreviewPhase("idle");
  }

  function updateRate(referenceId: string, patch: Partial<ReferenceRateDraft>) {
    setRates((previous) => previous.map((item) => item.referenceId === referenceId ? { ...item, ...patch } : item));
    setDraftDirty(true);
    clearReferencePreview();
  }

  function updateCatalogGramBinding(enabled: boolean) {
    setBindCatalogGrams(enabled);
    setCatalogGramReferenceId(enabled && goldReferences.length === 1 ? goldReferences[0]!.id : "");
    clearReferencePreview();
  }

  function resetNotice() { setNotice(""); setProblem(""); }
  function mutationFailure(failure: unknown) {
    setProblem(messageForFailure(failure, true));
    if (referencePricingErrorState(failure) === "verification_unavailable") setLocked(true);
  }

  async function defineReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || locked) return;
    resetNotice();
    if (kind !== "gold_gram" && definitions.some((item) => item.kind === kind)) {
      setProblem("Bu para birimi için zaten bir referans tanımı var. Değerini yukarıdan güncelleyin.");
      return;
    }
    let referencePurity: string | undefined;
    if (kind === "gold_gram" && purityText !== "") {
      referencePurity = parseTurkishPricingDecimal(purityText, 8) ?? undefined;
      if (!referencePurity || referencePurity === "0" || referencePurity > "1") {
        setProblem("Saflık oranını 0 ile 1 arasında virgüllü ondalık olarak girin (ör. 0,916).");
        return;
      }
    }
    setBusy("define");
    try {
      const created = await referencePricingApi.define({ referenceId: crypto.randomUUID(), kind, label: referenceLabel.trim(), ...(referencePurity ? { referencePurity } : {}) });
      setDefinitions((previous) => [...previous, created]);
      setRates((previous) => [...previous, { referenceId: created.id, rateText: "", active: false }]);
      setReferenceLabel(kind === "gold_gram" ? "Gram altın satış" : kind === "usd" ? "USD satış" : "EUR satış");
      setPurityText("");
      setNotice("Manuel referans tanımı oluşturuldu. Kullanıma almak için satış değerini girip yeni seti kaydedin.");
      setDraftDirty(true);
      clearReferencePreview();
      setDefinitionOpen(false);
      setWorkspaceTab("references");
    } catch (failure) { mutationFailure(failure); }
    finally { setBusy(""); }
  }

  async function save() {
    if (!canManage || busy || locked || !listing) return;
    resetNotice();
    let values;
    try { values = buildReferenceSetValues(definitions, rates); }
    catch { setProblem("Her etkin referansa sıfırdan büyük bir satış değeri girin. Sayı biçimi için 2,5 veya 5.000,50 kullanın."); return; }
    setBusy("save");
    try {
      const result = await referencePricingApi.saveSet({ setId: crypto.randomUUID(), expectedStateVersion: listing.stateVersion, values });
      setSavedSet(result);
      setDraftDirty(false);
      setListing((previous) => previous ? { ...previous, stateVersion: result.stateVersion,
        items: [{ setId: result.setId, version: result.version, createdAt: result.createdAt, isActive: false }, ...previous.items].slice(0, 20),
      } : previous);
      clearReferencePreview();
      setNotice("Referans değerleri taslak olarak kaydedildi. Etkiyi sunucuda önizleyip sonra uygulayın.");
    } catch (failure) { mutationFailure(failure); }
    finally { setBusy(""); }
  }

  async function loadPreview(cursor?: string) {
    if (!savedSet || draftDirty || busy || gramChoiceMissing) return;
    const generation = ++previewGeneration.current;
    setPreviewPhase("loading");
    setProblem("");
    try {
      const result = await referencePricingApi.preview({ setId: savedSet.setId, channel, pageSize: 20,
        ...(catalogGramChoice ? { catalogGramReferenceId: catalogGramChoice } : {}), ...(cursor ? { afterVariantId: cursor } : {}),
      });
      if (generation !== previewGeneration.current) return;
      if (cursor && preview && (result.scopeDigest !== preview.scopeDigest || result.affectedVariants !== preview.affectedVariants)) {
        setPreview(null); setPreviewEntries([]); setPreviewCursor(null); setPreviewPhase("error");
        setProblem("Önizleme sırasında fiyatlandırma değişti. Etkiyi yeniden yükleyin.");
        return;
      }
      if (!cursor) setPreview(result);
      setPreviewEntries((previous) => cursor ? [...previous, ...result.entries] : result.entries);
      setPreviewCursor(result.nextCursor);
      setPreviewPhase("ready");
    } catch (failure) {
      if (generation !== previewGeneration.current) return;
      setPreviewPhase("error"); setProblem(messageForFailure(failure, false));
    }
  }

  async function activate() {
    if (!canManage || busy || locked || !savedSet || !listing || gramChoiceMissing
      || !canActivateReferenceSet({ savedSetId: savedSet.setId, preview, dirty: draftDirty, catalogGramReferenceId: catalogGramChoice })) return;
    const unavailableNotice = preview!.unavailableVariants > 0
      ? `\n\n${preview!.unavailableVariants} varyantın yeni satış fiyatı hesaplanamıyor ve yeni satışa geçici olarak kapanacak. Sabit TL ürünleri etkilenmez.`
      : "";
    if (!window.confirm(`${preview!.affectedProducts} ürün ve ${preview!.affectedVariants} varyant için yeni manuel referans değerleri uygulanacak.${unavailableNotice}\n\nDevam edilsin mi?`)) return;
    resetNotice();
    setBusy("activate");
    try {
      await referencePricingApi.activate({ setId: savedSet.setId, expectedStateVersion: listing.stateVersion, expectedScopeDigest: preview!.scopeDigest,
        ...(catalogGramChoice ? { catalogGramReferenceId: catalogGramChoice } : {}),
      });
      setNotice("Manuel referans sürümü etkinleştirildi. Güncel fiyatlar sunucu tarafından yeniden çözümlenir.");
      await reload();
    } catch (failure) { mutationFailure(failure); }
    finally { setBusy(""); }
  }

  async function openHistorySet(setId: string) {
    if (busy || locked) return;
    setBusy("history"); setProblem("");
    try {
      const selected = await referencePricingApi.getSet(setId);
      setHistoryDetail(selected);
      if (selected.isActive) {
        setNotice("Etkin sürüm görüntüleniyor. Yeni değerleri değiştirmek için üstteki alanları kullanın.");
      } else {
        setSavedSet(selected);
        setRates(definitions.map((definition) => {
          const found = selected.values.find((value) => value.referenceId === definition.id);
          return { referenceId: definition.id, rateText: displayDecimal(found?.rateTry), active: found?.active ?? false };
        }));
        setDraftDirty(false);
        clearReferencePreview();
        setNotice("Taslak sürüm açıldı. Etkiyi önizleyip aynı sürümü uygulayabilirsiniz.");
        setWorkspaceTab("references");
        requestAnimationFrame(() => document.getElementById("pricing-tab-references")?.focus());
      }
    } catch (failure) { setProblem(messageForFailure(failure, false)); }
    finally { setBusy(""); }
  }

  async function loadOlderHistory() {
    if (!listing?.nextCursor || busy) return;
    setBusy("history"); setProblem("");
    try {
      const next = await referencePricingApi.listSets({ pageSize: 20, afterSetVersion: listing.nextCursor });
      if (next.stateVersion !== listing.stateVersion) {
        setProblem("Sürüm geçmişi değişti. Güncel listeyi yeniden yükleyin.");
        return;
      }
      setListing({ ...next, items: [...listing.items, ...next.items] });
    } catch (failure) { setProblem(messageForFailure(failure, false)); }
    finally { setBusy(""); }
  }

  if (!canRead) return <PanelPageShell><PanelPageHeader title="Kur ve altın referansları" /><p className={styles.state} role="status">Bu mağazanın fiyatlandırma referanslarını görüntüleme yetkiniz yok.</p></PanelPageShell>;
  return <PanelPageShell>
    <PanelPageHeader title="Kur ve altın referansları" />
    <div className={styles.root} data-settings-dirty={draftDirty ? "true" : undefined}>
      {phase === "loading" ? <div className={styles.loading} role="status" aria-label="Referanslar yükleniyor"><span /><span /><span /></div> : null}
      {phase === "error" ? <div className={styles.feedback} role="alert"><p>{problem}</p><button type="button" onClick={() => void reload()}>Yeniden dene</button></div> : null}
      {phase === "ready" ? <>
        <div className={styles.intro}><div><strong>Manuel kur ve altın referansları</strong><PanelStatusBadge tone={activeSet ? "success" : "neutral"}>{activeSet ? `Etkin sürüm v${activeSet.version}` : "Etkin set yok"}</PanelStatusBadge></div>{canManage ? <button ref={definitionTriggerRef} type="button" onClick={() => { setProblem(""); setDefinitionOpen(true); }} disabled={Boolean(busy) || locked}><Plus size={16} aria-hidden="true" />Tanım ekle</button> : null}</div>
        <p className={styles.subtle}>Bu değerler piyasa verisi değildir; siz değiştirene kadar geçerlidir. TRY sabit 1’dir ve burada düzenlenmez.</p>
        {notice ? <p className={styles.success} role="status">{notice}</p> : null}
        {problem ? <p className={styles.feedback} role="alert">{problem}</p> : null}
        {locked ? <p className={styles.warning} role="alert">İşlem sonucu doğrulanmadan başka kayıt yapılamaz. <a href="/settings/pricing">Sayfayı tamamen yenile</a>.</p> : null}
        {!canManage ? <p className={styles.state} role="status">Görüntüleme modundasınız; referansları değiştirmek için fiyatlandırma yetkisi gerekir.</p> : null}
        <nav className={styles.tabs} role="tablist" aria-label="Fiyat referansı görünümleri">{WORKSPACE_TABS.map(({ id, label }) => <button key={id} id={`pricing-tab-${id}`} type="button" role="tab" aria-selected={workspaceTab === id} aria-controls={`pricing-panel-${id}`} tabIndex={workspaceTab === id ? 0 : -1} onClick={() => setWorkspaceTab(id)} onKeyDown={(event) => navigateTabs(event, id)}>{label}</button>)}</nav>

        <section className={styles.section} id="pricing-panel-references" role="tabpanel" aria-labelledby="pricing-tab-references" hidden={workspaceTab !== "references"}>
          <div className={styles.sectionHeading}><div><h2 id="reference-values-title">Satış referansları</h2><p>Kaynak: Manuel · Birim: TL / seçili birim</p></div><span className={styles.subtle}>{definitions.length} tanım</span></div>
          {definitions.length === 0 ? <div className={styles.empty}><h3>Henüz referans tanımı yok</h3><p>USD, EUR veya gram altın için mağazanıza özel bir manuel satış referansı oluşturun. Herhangi bir piyasa değeri otomatik eklenmez.</p></div> : <div className={styles.rateList}>{definitions.map((definition) => {
            const draft = rates.find((item) => item.referenceId === definition.id);
            return <div className={styles.rateRow} key={definition.id}>
              <div className={styles.rateIdentity}><strong>{definition.label}</strong><span>{KIND_LABEL[definition.kind]} · 1 birim için TL{definition.referencePurity ? ` · referans saflığı ${displayDecimal(definition.referencePurity)}` : ""}</span><small>Tanımlandı: {fmtDate(definition.createdAt)}</small></div>
              {canManage ? <div className={styles.rateControls}><label><span>Mağaza satış referansı (TL)</span><input inputMode="decimal" autoComplete="off" value={draft?.rateText ?? ""} onChange={(event) => updateRate(definition.id, { rateText: event.target.value })} aria-describedby={`rate-help-${definition.id}`} disabled={Boolean(busy) || locked} /></label><small id={`rate-help-${definition.id}`}>Örnek: 5.000,50 · En çok 8 ondalık</small><label className={styles.toggle}><input type="checkbox" checked={draft?.active ?? false} onChange={(event) => updateRate(definition.id, { active: event.target.checked })} disabled={Boolean(busy) || locked} /><span>Bu referansı kullan</span></label></div> : <div className={styles.rateReadOnly}><strong>{draft?.rateText || "Değer yok"}</strong><span>{draft?.active ? "Kullanımda" : "Pasif"}</span></div>}
            </div>;
          })}</div>}
          {canManage && goldReferences.length > 0 ? <div className={styles.catalogGramControls}>
            <label className={styles.toggle}><input type="checkbox" checked={bindCatalogGrams} onChange={(event) => updateCatalogGramBinding(event.target.checked)} disabled={Boolean(busy) || locked} /><span>Gramı olan ürünleri bu tarifeye bağla</span></label>
            {bindCatalogGrams && goldReferences.length > 1 ? <label><span>Gram tarifesi</span><select value={catalogGramReferenceId} onChange={(event) => { setCatalogGramReferenceId(event.target.value); clearReferencePreview(); }} disabled={Boolean(busy) || locked}><option value="">Tarife seçin</option>{goldReferences.map((definition) => <option key={definition.id} value={definition.id}>{definition.label}</option>)}</select></label> : null}
            <small>Gram × gram fiyatı; gramı olmayan ürünler sabit kalır.</small>
            {gramChoiceMissing ? <small role="status">Önizlemek için bir gram tarifesi seçin.</small> : null}
          </div> : null}
          {canManage && definitions.length > 0 ? <div className={styles.actions}><button className={savedSet && !draftDirty ? undefined : styles.primary} type="button" onClick={() => void save()} disabled={Boolean(busy) || locked}>{busy === "save" ? "Kaydediliyor…" : "Taslağı kaydet"}</button><span>Kaydetmek canlı fiyatı değiştirmez.</span></div> : null}
        </section>

        {canManage ? <dialog ref={definitionDialogRef} className={styles.definitionDialog} aria-labelledby="new-reference-title" onCancel={(event) => { if (busy) event.preventDefault(); else setDefinitionOpen(false); }} onClose={() => setDefinitionOpen(false)}><header className={styles.definitionHeader}><h2 id="new-reference-title">Yeni referans tanımı</h2><button type="button" className={styles.closeButton} onClick={() => setDefinitionOpen(false)} disabled={Boolean(busy)} aria-label="Referans tanımı penceresini kapat"><X size={20} /></button></header><p className={styles.definitionHelp}>Tanımın adını veya saflık temelini sonra sessizce değiştirmek yerine yeni tanım oluşturun.</p>{problem ? <p className={styles.feedback} role="alert">{problem}</p> : null}<form className={styles.definitionForm} onSubmit={(event) => void defineReference(event)}><label><span>Birim</span><select value={kind} onChange={(event) => { const next = event.target.value as Kind; setKind(next); setReferenceLabel(next === "usd" ? "USD satış" : next === "eur" ? "EUR satış" : "Gram altın satış"); }} disabled={Boolean(busy) || locked}><option value="usd" disabled={definitions.some((item) => item.kind === "usd")}>USD</option><option value="eur" disabled={definitions.some((item) => item.kind === "eur")}>EUR</option><option value="gold_gram">Gram altın</option></select></label><label><span>Tanım adı</span><input required maxLength={120} value={referenceLabel} onChange={(event) => setReferenceLabel(event.target.value)} disabled={Boolean(busy) || locked} /></label>{kind === "gold_gram" ? <label><span>Referans saflığı (isteğe bağlı)</span><input inputMode="decimal" placeholder="0,916" value={purityText} onChange={(event) => setPurityText(event.target.value)} disabled={Boolean(busy) || locked} /><small>Oran modunda kullanılacaksa gerçek saflık oranını girin.</small></label> : null}<footer className={styles.definitionActions}><button type="button" onClick={() => setDefinitionOpen(false)} disabled={Boolean(busy)}>Vazgeç</button><button className={styles.primary} type="submit" disabled={Boolean(busy) || locked}>{busy === "define" ? "Ekleniyor…" : "Tanım ekle"}</button></footer></form></dialog> : null}

        <section className={styles.section} id="pricing-panel-preview" role="tabpanel" aria-labelledby="pricing-tab-preview" hidden={workspaceTab !== "preview"}><div className={styles.sectionHeading}><div><h2 id="impact-title">Etkiyi önizle ve uygula</h2><p>Fiyat hesabı yalnız sunucuda yapılır. Sabit fiyat listeleri ayrı kalır; eski siparişler değişmez.</p></div></div><div className={styles.previewControls}><label><span>Kanal</span><select value={channel} onChange={(event) => { setChannel(event.target.value as "storefront" | "quick_order"); clearReferencePreview(); }}><option value="storefront">Mağaza</option><option value="quick_order">Hızlı sipariş</option></select></label><button type="button" onClick={() => void loadPreview()} disabled={!savedSet || draftDirty || gramChoiceMissing || Boolean(busy) || previewPhase === "loading"}>{previewPhase === "loading" ? "Hesaplanıyor…" : "Sunucuda önizle"}</button></div>
          {!savedSet ? <p className={styles.state}>Önizleme için önce bir referans taslağı kaydedin.</p> : draftDirty ? <p className={styles.warning}>Taslak kayıttan sonra değişti. Yeniden kaydedip etkiyi tekrar önizleyin.</p> : null}
          {previewPhase === "error" ? <p className={styles.feedback} role="alert">Önizleme yüklenemedi. Verileriniz korundu; tekrar deneyin.</p> : null}
          {preview ? <><div className={styles.impactStats}><div><span>Etkilenen ürün</span><strong>{preview.affectedProducts}</strong></div><div><span>Etkilenen varyant</span><strong>{preview.affectedVariants}</strong></div><div><span>Sabit liste etkisi</span><strong>{preview.fixedOverrideVariants}</strong></div><div><span>Hesaplanamayan</span><strong>{preview.unavailableVariants}</strong></div></div><p className={styles.subtle}>Toplamlar tüm katalog için sunucudan gelir; aşağıdaki kayıtlar sayfalıdır.</p><div className={styles.tableScroll}><table><caption>Sunucu fiyat etkisi, {channel === "storefront" ? "mağaza" : "hızlı sipariş"} kanalı</caption><thead><tr><th>Varyant</th><th>Eski fiyat</th><th>Yeni fiyat</th><th>Not</th></tr></thead><tbody>{previewEntries.length ? previewEntries.map((entry) => <tr key={entry.variantId}><td>{entry.variantId.slice(0, 8)}…</td><td>{formatCents(entry.oldPriceCents)}</td><td>{formatCents(entry.newPriceCents)}</td><td>{entry.overriddenByPriceList ? "Sabit liste geçerli" : entry.newPriceCents === null ? "Satışa kapalı" : "Referans fiyatı"}</td></tr>) : <tr><td colSpan={4}>Bu setin fiyatını değiştirdiği varyant yok.</td></tr>}</tbody></table></div>{previewCursor ? <button className={styles.more} type="button" onClick={() => void loadPreview(previewCursor)} disabled={previewPhase === "loading"}>Sonraki varyantları göster</button> : null}{preview.unavailableVariants > 0 ? <p className={styles.warning} role="alert">{catalogGramChoice ? `${preview.unavailableVariants} varyantın yeni satış fiyatı hesaplanamıyor. Gram tarifesini uygulamak için referans değerlerini düzeltip yeniden önizleyin.` : `${preview.unavailableVariants} varyantın yeni satış fiyatı hesaplanamıyor. Bu set etkinleştirilirse yalnız bağlı yeni satışlar kapanır; devam etmek için açık teyit gerekir.`}</p> : null}{canManage ? <div className={styles.actions}><button className={styles.primary} type="button" onClick={() => void activate()} disabled={Boolean(busy) || locked || previewPhase !== "ready" || gramChoiceMissing || !canActivateReferenceSet({ savedSetId: savedSet?.setId ?? null, preview, dirty: draftDirty, catalogGramReferenceId: catalogGramChoice })}>{busy === "activate" ? "Uygulanıyor…" : "Onayla ve uygula"}</button><span>Etkinleştirme anında kapsam ve sürüm yeniden doğrulanır.</span></div> : null}</> : null}
        </section>

        <section className={styles.section} id="pricing-panel-history" role="tabpanel" aria-labelledby="pricing-tab-history" hidden={workspaceTab !== "history"}><div className={styles.sectionHeading}><div><h2 id="history-title">Sürüm geçmişi</h2><p>Etkin ve taslak sürümler; eski kayıtları gerektiğinde açabilirsiniz.</p></div></div>{listing?.items.length ? <><div className={styles.tableScroll}><table><caption>Manuel referans seti geçmişi</caption><thead><tr><th>Oluşturuldu</th><th>Sürüm</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{listing.items.map((item) => <tr key={item.setId}><td>{fmtDate(item.createdAt)}</td><td>v{item.version}</td><td><PanelStatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Etkin" : "Taslak"}</PanelStatusBadge></td><td><button type="button" onClick={() => void openHistorySet(item.setId)} disabled={Boolean(busy) || locked}>{item.isActive ? "Görüntüle" : "Taslağı aç"}</button></td></tr>)}</tbody></table></div>{listing.nextCursor ? <button className={styles.more} type="button" onClick={() => void loadOlderHistory()} disabled={Boolean(busy)}>Daha eski sürümler</button> : null}{historyDetail ? <div className={styles.historyDetail}><h3>v{historyDetail.version} · {historyDetail.isActive ? "Etkin" : "Taslak"}</h3><dl>{historyDetail.values.map((item) => <div key={item.referenceId}><dt>{item.label}</dt><dd>{item.rateTry === null ? "Değer yok" : `${displayDecimal(item.rateTry)} TL`}{item.active ? " · Kullanımda" : " · Pasif"}</dd></div>)}</dl></div> : null}</> : <p className={styles.state}>Henüz kaydedilmiş referans sürümü yok.</p>}</section>
      </> : null}
    </div>
  </PanelPageShell>;
}
