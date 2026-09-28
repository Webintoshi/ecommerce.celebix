"use client";

import { FIXED_STOREFRONT_POLICIES, type StorefrontPolicyKey } from "@celebix/saas-contracts";
import { normalizeProductDescriptionRichText, type ProductDescriptionRichTextNode } from "@celebix/platform-config/src/product-description-rich-text";
import type { StorePolicyAdminPage, StorePolicyStatus } from "@celebix/saas-data";
import { Check, ChevronDown, ChevronRight, Clock3, Cookie, FileText, Fingerprint, Globe, Info, PanelLeftClose, RefreshCcw, Scale, ShieldCheck, Truck, Undo2, UserRound, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { ProductDescriptionPreview } from "@/components/catalog/ProductDescriptionPreview";
import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { PanelPageShell, PanelSkeletonBlock } from "@/components/panel/PanelPageShell";
import { createDirtyNavigationGuard } from "@/lib/catalog-ui/dirty-navigation";
import { policyBodySourceFormat } from "@/lib/policy-body-editor";
import { StorePolicyApiError, storePolicyApi } from "@/lib/store-policy-ui/client";

import { readPolicyNavigationDrafts, retainPolicyNavigationDrafts } from "./policy-navigation-recovery";
import styles from "./policy-console.module.css";

const PolicyBodyField = dynamic(() => import("./PolicyBodyField").then((module) => module.PolicyBodyField), {
  ssr: false,
  loading: () => <div className={styles.editorLoading} aria-label="Metin düzenleyicisi yükleniyor"><PanelSkeletonBlock /></div>,
});
const POLICY_ICONS = [ShieldCheck, Scale, Fingerprint, Truck, Cookie, Undo2, UserRound];
const utf8 = new TextEncoder();
const CONFLICT_REFRESH_ERROR = "Metin başka bir oturumda güncellendi. Metniniz korundu; kaydetmeden önce güncel sürümü alın.";
const UNKNOWN_COMMIT_ERROR = "Kaydın sonucu doğrulanamadı. Metniniz korundu; yeniden kaydetmeden önce sonucu kontrol edin.";

type Recovery = "conflict" | "unknown" | null;
type View = "edit" | "source" | "preview";
type PolicyDraft = Readonly<{ body: string; status: StorePolicyStatus; recovery: Recovery; version: number }>;

function updatedAt(value: string, short = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", {
    dateStyle: short ? "short" : "medium", ...(short ? {} : { timeStyle: "short" }),
  }).format(date);
}

function hasText(nodes: readonly ProductDescriptionRichTextNode[]): boolean {
  return nodes.some((node) => node.type === "text" ? !!node.value.trim() : hasText(node.children));
}

function DocumentArt({ preview = false }: { preview?: boolean }) {
  return <svg viewBox="0 0 180 160" className={styles.art} aria-hidden="true" fill="none">
    <ellipse cx="90" cy="143" rx="60" ry="8" fill="var(--policy-border)" opacity=".45" />
    {preview ? <>
      <rect x="22" y="30" width="136" height="104" rx="12" fill="var(--policy-surface)" stroke="var(--policy-border)" strokeWidth="2" />
      <path d="M22 54h136" stroke="var(--policy-border)" strokeWidth="2" />
      <circle cx="35" cy="42" r="3" fill="var(--policy-brand)" /><circle cx="45" cy="42" r="3" fill="var(--policy-border)" /><circle cx="55" cy="42" r="3" fill="var(--policy-border)" />
      <path d="M49 89s15-22 41-22 41 22 41 22-15 22-41 22-41-22-41-22Z" fill="var(--policy-canvas)" stroke="var(--policy-text)" strokeWidth="2" />
      <circle cx="90" cy="89" r="13" fill="var(--policy-brand)" /><circle cx="90" cy="89" r="5" fill="var(--policy-surface)" />
    </> : <>
      <rect x="38" y="22" width="93" height="113" rx="10" fill="var(--policy-canvas)" stroke="var(--policy-border)" strokeWidth="2" transform="rotate(-7 85 78)" />
      <path d="M58 20h48l28 28v83a9 9 0 0 1-9 9H58a9 9 0 0 1-9-9V29a9 9 0 0 1 9-9Z" fill="var(--policy-surface)" stroke="var(--policy-text)" strokeWidth="2" />
      <path d="M106 20v20a8 8 0 0 0 8 8h20M66 64h48M66 77h40M66 90h28" stroke="var(--policy-border)" strokeWidth="3" strokeLinecap="round" />
      <path d="m119 83 23 9v17c0 16-23 27-23 27s-23-11-23-27V92l23-9Z" fill="var(--policy-brand)" /><path d="m108 109 8 8 14-17" stroke="var(--policy-surface)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </>}
  </svg>;
}

export function PolicyConsole({ canManage, initialPolicyKey, recoveryScope, embedded = false }: {
  canManage: boolean; initialPolicyKey?: StorefrontPolicyKey; recoveryScope?: string; embedded?: boolean;
}) {
  const [items, setItems] = useState<readonly StorePolicyAdminPage[]>([]);
  const [selected, setSelected] = useState<StorePolicyAdminPage | null>(null);
  const [body, setBody] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StorePolicyStatus>("draft");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [recovery, setRecovery] = useState<Recovery>(null);
  const [view, setView] = useState<View>("edit");
  const [split, setSplit] = useState(false);
  const [help, setHelp] = useState(false);
  const [draftRevision, redrawDrafts] = useState(0);
  const draftsRef = useRef(new Map<StorefrontPolicyKey, PolicyDraft>(canManage ? readPolicyNavigationDrafts(recoveryScope).map((draft) => [draft.key, draft]) : []));
  const triggerRefs = useRef(new Map<StorefrontPolicyKey, HTMLButtonElement>());
  const closeRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDetailsElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const revertRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef(new Map<View, HTMLButtonElement>());
  const focusEditorRef = useRef(false);
  const busyRef = useRef(false);
  const requestRef = useRef(0);
  const selectedRef = useRef(selected);
  const itemsRef = useRef(items);
  selectedRef.current = selected;
  itemsRef.current = items;

  const open = useCallback((page: StorePolicyAdminPage, focus = true) => {
    if (busyRef.current) return;
    const draft = draftsRef.current.get(page.key);
    setSelected(page);
    setBody(draft?.body ?? page.body);
    setSelectedStatus(draft?.status ?? page.status);
    setRecovery(draft?.recovery ?? null);
    setMessage("");
    setError(draft?.recovery === "unknown" ? UNKNOWN_COMMIT_ERROR : draft?.recovery ? CONFLICT_REFRESH_ERROR : "");
    setView("edit"); setSplit(false); setHelp(false);
    focusEditorRef.current = focus;
    if (window.matchMedia("(max-width: 760px)").matches && pickerRef.current) pickerRef.current.open = false;
  }, []);

  const load = useCallback(async (initial = false) => {
    if (busyRef.current) return;
    const request = ++requestRef.current;
    setLoading(true); setLoadError("");
    try {
      const pages = await storePolicyApi.list();
      if (request !== requestRef.current) return;
      for (const page of pages) {
        const draft = draftsRef.current.get(page.key);
        if (!draft) continue;
        if (!draft.recovery && draft.body === page.body && draft.status === page.status) draftsRef.current.delete(page.key);
        else if (!draft.recovery && draft.version !== page.version) draftsRef.current.set(page.key, { ...draft, recovery: "conflict" });
      }
      setItems(pages);
      const key = initial ? initialPolicyKey ?? pages[0]?.key : selectedRef.current?.key;
      const target = pages.find((page) => page.key === key);
      if (target) open(target, false);
      else if (key) { setSelected(null); setLoadError("Seçilen metin kullanılamıyor. Listeyi yeniden yükleyin."); }
    } catch (caught) {
      if (request === requestRef.current) setLoadError(caught instanceof Error ? caught.message : "Metinler yüklenemedi.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [initialPolicyKey, open]);

  useEffect(() => { void load(true); return () => { requestRef.current++; }; }, [load]);
  useEffect(() => {
    if (focusEditorRef.current) { closeRef.current?.focus(); focusEditorRef.current = false; }
  }, [selected?.key]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => { if (pickerRef.current) pickerRef.current.open = !media.matches; if (media.matches) setSplit(false); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [items.length]);
  useEffect(() => {
    const guard = createDirtyNavigationGuard({
      isDirty: () => busyRef.current || [...draftsRef.current].some(([key, draft]) => {
        const saved = itemsRef.current.find((page) => page.key === key);
        return !!draft.recovery || draft.body !== saved?.body || draft.status !== saved?.status;
      }),
      confirm: () => {
        if (busyRef.current) { setMessage("Kayıt tamamlanana kadar bekleyin."); return false; }
        return window.confirm("Kaydedilmemiş metinler var. Sayfadan ayrılmak istiyor musunuz?");
      },
    });
    const unload = guard.bindBeforeUnload(window);
    const navigation = guard.bindApplicationNavigation(document, () => window.location.href);
    // Supported same-document history traversals do not fire beforeunload.
    const historyNavigation = (window as Window & { navigation?: {
      addEventListener(type: "navigate", listener: (event: Event) => void): void;
      removeEventListener(type: "navigate", listener: (event: Event) => void): void;
    } }).navigation;
    const onTraverse = (raw: Event) => {
      const event = raw as Event & { navigationType?: string; destination?: { url: string; sameDocument: boolean } };
      if (event.defaultPrevented || event.navigationType !== "traverse" || !event.cancelable || !event.destination?.sameDocument) return;
      const current = new URL(window.location.href);
      const destination = new URL(event.destination.url);
      if (destination.origin !== current.origin || (destination.pathname === current.pathname && destination.search === current.search)) return;
      if (!guard.canLeave()) event.preventDefault();
    };
    historyNavigation?.addEventListener("navigate", onTraverse);
    return () => { unload(); navigation(); historyNavigation?.removeEventListener("navigate", onTraverse); };
  }, []);

  useEffect(() => {
    if (!canManage) return;
    const pending = [...draftsRef.current].filter(([key, draft]) => {
      const saved = items.find((page) => page.key === key);
      return !!draft.recovery || draft.body !== saved?.body || draft.status !== saved?.status;
    }).map(([key, draft]) => ({ ...draft, key }));
    retainPolicyNavigationDrafts(recoveryScope, pending);
  }, [canManage, recoveryScope, draftRevision, items]);

  function rememberDraft(nextBody: string, nextStatus: StorePolicyStatus, nextRecovery = recovery) {
    if (!selected) return;
    draftsRef.current.set(selected.key, { body: nextBody, status: nextStatus, recovery: nextRecovery, version: selected.version });
    redrawDrafts((current) => current + 1);
  }
  function changeBody(value: string) {
    if (!canManage || busyRef.current || loading) return;
    setBody(value); rememberDraft(value, selectedStatus); setMessage("");
  }
  function changeStatus(value: StorePolicyStatus) {
    if (!canManage || busyRef.current || loading) return;
    setSelectedStatus(value); rememberDraft(body, value); setMessage("");
  }
  function close() {
    if (busyRef.current) return;
    const key = selected?.key;
    setSelected(null); setError(""); setMessage(""); setRecovery(null);
    queueMicrotask(() => {
      if (window.matchMedia("(max-width: 760px)").matches) pickerRef.current?.querySelector("summary")?.focus();
      else if (key) triggerRefs.current.get(key)?.focus();
    });
  }
  function updateSaved(page: StorePolicyAdminPage) {
    setItems((current) => current.map((item) => item.key === page.key ? page : item)); setSelected(page);
  }
  async function refreshVersion() {
    if (!selected || !recovery || busyRef.current || loading) return;
    const reason = recovery;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const fresh = await storePolicyApi.get(selected.key);
      updateSaved(fresh); setRecovery(null);
      if (reason === "unknown" && fresh.body === body.trim() && fresh.status === selectedStatus) {
        setBody(fresh.body); setSelectedStatus(fresh.status); draftsRef.current.delete(fresh.key); setMessage("Kayıt doğrulandı.");
      } else {
        draftsRef.current.set(fresh.key, { body, status: selectedStatus, recovery: null, version: fresh.version }); redrawDrafts((current) => current + 1); setMessage("Güncel sürüm alındı. Metniniz korundu; kontrol edip kaydedin.");
      }
    } catch { setError(reason === "unknown" ? UNKNOWN_COMMIT_ERROR : CONFLICT_REFRESH_ERROR); }
    finally { busyRef.current = false; setBusy(false); }
  }

  const dirty = !!selected && (body !== selected.body || selectedStatus !== selected.status);
  const tooLong = utf8.encode(body.trim()).byteLength > 100_000;
  const hasContent = useMemo(() => hasText(normalizeProductDescriptionRichText(body)), [body]);
  const publishEmpty = selectedStatus === "published" && !hasContent;
  const canSave = !!selected && canManage && dirty && !busy && !loading && !recovery && !tooLong && !publishEmpty;

  async function save() {
    if (!canSave || !selected || busyRef.current) return;
    const key = selected.key;
    const pending = { body, status: selectedStatus, version: selected.version };
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const saved = await storePolicyApi.save(key, { expectedVersion: selected.version, body: body.trim(), status: selectedStatus });
      updateSaved(saved); setBody(saved.body); setSelectedStatus(saved.status); setRecovery(null); draftsRef.current.delete(key);
      setMessage(saved.status === "published" ? "Kaydedildi · Mağazada yayında" : "Taslak kaydedildi.");
    } catch (caught) {
      if (caught instanceof StorePolicyApiError && caught.code === "version_conflict") {
        draftsRef.current.set(key, { ...pending, recovery: "conflict" }); setRecovery("conflict");
        try {
          const fresh = await storePolicyApi.get(key);
          updateSaved(fresh); setRecovery(null); draftsRef.current.set(key, { ...pending, recovery: null, version: fresh.version });
          setError("Metin başka bir oturumda güncellendi. Metniniz korundu; kontrol edip yeniden kaydedin.");
        } catch { setError(CONFLICT_REFRESH_ERROR); }
      } else if (caught instanceof StorePolicyApiError && caught.code === "commit_unknown") {
        draftsRef.current.set(key, { ...pending, recovery: "unknown" }); setRecovery("unknown"); setError(UNKNOWN_COMMIT_ERROR);
      } else { setError(`${caught instanceof Error ? caught.message : "Metin kaydedilemedi."} Metniniz korundu.`); }
    } finally { busyRef.current = false; setBusy(false); redrawDrafts((current) => current + 1); }
  }
  function revert() {
    if (!selected || busyRef.current || recovery) return;
    draftsRef.current.delete(selected.key); setBody(selected.body); setSelectedStatus(selected.status);
    setMessage(""); setError(""); redrawDrafts((current) => current + 1); dialogRef.current?.close();
  }
  function tabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: View) {
    const order: View[] = ["edit", "source", "preview"];
    const index = order.indexOf(current);
    const next = event.key === "Home" ? order[0] : event.key === "End" ? order[2] : event.key === "ArrowRight" ? order[(index + 1) % 3] : event.key === "ArrowLeft" ? order[(index + 2) % 3] : null;
    if (!next) return;
    event.preventDefault(); setView(next); setSplit(false); queueMicrotask(() => tabRefs.current.get(next)?.focus());
  }

  const publishedCount = items.filter((page) => page.status === "published").length;
  const draftCount = items.filter((page) => page.status === "draft").length;
  const sourceFormat = policyBodySourceFormat(body);

  return <PanelPageShell embedded={embedded}>
    {!embedded ? <PanelTopbarBridge title="Politikalar" /> : null}
    <div className={styles.page}>
      <h1 className={styles.srOnly}>Politikalar</h1>
      <div className={styles.overview}>
        <dl className={styles.summary} aria-label="Politika özeti">
          <div className={styles.total}><dt className={styles.srOnly}>Mağaza metinleri</dt><dd>{items.length}<span>metin</span></dd></div>
          <div><dt>Yayındaki metinler</dt><dd><i className={styles.publishedDot} />{publishedCount}<span>yayında</span></dd></div>
          <div><dt>Taslak metinler</dt><dd>{draftCount}<span>taslak</span></dd></div>
        </dl>
        <button className={styles.button} type="button" onClick={() => void load()} disabled={loading || busy}><RefreshCcw aria-hidden="true" />Yenile</button>
      </div>
      {loadError ? <div className={styles.notice} role="alert"><Info aria-hidden="true" /><p>{loadError}</p><button className={styles.button} type="button" disabled={loading || busy} onClick={() => void load(!items.length)}>Yeniden dene</button></div> : null}
      {loading && !items.length ? <div className={styles.skeleton} role="status" aria-label="Metinler yükleniyor">{Array.from({ length: 7 }, (_, index) => <PanelSkeletonBlock key={index} />)}</div> : null}
      {!loading && !items.length && !loadError ? <div className={styles.empty}><DocumentArt /><strong>Metinler kullanılamıyor</strong><button className={styles.button} type="button" onClick={() => void load(true)}>Yeniden yükle</button></div> : null}
      {items.length > 0 ? <section className={styles.workspace} data-testid="policy-workspace" aria-label="Politika çalışma alanı" aria-busy={loading}>
        <aside className={styles.listColumn}>
          <details className={styles.picker} ref={pickerRef} open>
            <summary><span>{selected?.label ?? "Metin seç"}</span><ChevronDown aria-hidden="true" /></summary>
            <ol className={styles.list}>
              {FIXED_STOREFRONT_POLICIES.map((definition, index) => {
                const page = items.find((item) => item.key === definition.key);
                const draft = draftsRef.current.get(definition.key);
                const unsaved = !!draft && (!!draft.recovery || draft.body !== page?.body || draft.status !== page?.status);
                const Icon = POLICY_ICONS[index] ?? FileText;
                return <li key={definition.key}><button type="button" data-policy-key={definition.key}
                  className={`${styles.policy} ${selected?.key === definition.key ? styles.active : ""}`}
                  aria-current={selected?.key === definition.key ? "true" : undefined}
                  aria-label={`${definition.label}, ${canManage ? "düzenle" : "görüntüle"}`} aria-describedby={`policy-meta-${definition.key}`}
                  disabled={!page || busy || loading}
                  ref={(node) => { if (node) triggerRefs.current.set(definition.key, node); else triggerRefs.current.delete(definition.key); }}
                  onClick={() => { if (page) open(page); }}>
                  <Icon className={styles.policyIcon} aria-hidden="true" />
                  <span className={styles.policyText}><strong>{definition.label}</strong><span className={styles.policyMeta} id={`policy-meta-${definition.key}`}>
                    {page ? <>{page.status === "published" ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}<span>{page.status === "published" ? "Yayında" : "Taslak"}</span><time dateTime={page.updatedAt}>{updatedAt(page.updatedAt, true)}</time></> : <span>Kullanılamıyor</span>}
                    {unsaved ? <><i className={styles.dirtyDot} aria-hidden="true" /><span className={styles.srOnly}>Kaydedilmemiş değişiklikler</span></> : null}
                  </span><code>{definition.route}</code></span>
                  <ChevronRight className={styles.chevron} aria-hidden="true" />
                </button></li>;
              })}
            </ol>
          </details>
          <div className={styles.listFoot}><DocumentArt /><div><strong>Mağaza bağlantıları</strong><p>Yayındaki metinler alt menüye eklenir.</p></div></div>
        </aside>
        <section className={styles.editor} ref={editorRef} aria-label="Politika düzenleyicisi" onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && !editorRef.current?.querySelector('dialog[open], [role="dialog"]')) { event.preventDefault(); void save(); }
        }}>
          {selected ? <>
            <header className={styles.editorHeader}><div><h2>{selected.label}</h2><code>{selected.route}</code><p>Son kayıt <time dateTime={selected.updatedAt}>{updatedAt(selected.updatedAt)}</time><span> · Kaydedilen: {selected.status === "published" ? "Yayında" : "Taslak"}</span></p></div><button className={styles.iconButton} type="button" aria-label="Düzenleyiciyi kapat" ref={closeRef} onClick={close} disabled={busy}><X aria-hidden="true" /></button></header>
            {!canManage ? <p className={styles.readonly}><Info aria-hidden="true" />Bu metinleri yalnızca görüntüleyebilirsiniz.</p> : null}
            {error ? <div className={styles.notice} role="alert"><Info aria-hidden="true" /><p>{error}</p>{recovery ? <button className={styles.button} type="button" disabled={busy || loading} onClick={() => void refreshVersion()}>{recovery === "unknown" ? "Sonucu doğrula" : "Güncel sürümü al"}</button> : null}</div> : null}
            <div className={styles.statusLine}>
              <fieldset className={styles.publication} disabled={!canManage || busy || loading}><legend>Yayın durumu</legend><div role="radiogroup" aria-label="Yayın durumu">{(["draft", "published"] as const).map((value) => <label key={value} className={selectedStatus === value ? styles.checked : ""}><input type="radio" name="policy-publication" value={value} checked={selectedStatus === value} onChange={() => changeStatus(value)} />{value === "published" ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}{value === "published" ? "Yayında" : "Taslak"}</label>)}</div></fieldset>
              <p>{selectedStatus === "published" ? "Kaydedildiğinde mağazada görünür." : selected.status === "published" ? "Kaydedildiğinde mağazadan kaldırılır." : "Yalnızca panelde saklanır."}</p>
            </div>
            <div className={styles.editSurface}>
              <div className={styles.editTop}>
                <div className={styles.tabs} role="tablist" aria-label="Metin görünümü">{(["edit", "source", "preview"] as const).map((tab) => <button type="button" id={`policy-tab-${tab}`} role="tab" key={tab} aria-selected={view === tab} aria-controls={tab === "preview" ? "policy-preview" : "policy-source"} tabIndex={view === tab ? 0 : -1} ref={(node) => { if (node) tabRefs.current.set(tab, node); else tabRefs.current.delete(tab); }} onClick={() => { setView(tab); setSplit(false); }} onKeyDown={(event) => tabKeyDown(event, tab)}>{tab === "edit" ? canManage ? "Düzenle" : "Metin" : tab === "source" ? "Kaynak" : "Önizle"}</button>)}</div>
                <div className={styles.viewActions}><button className={styles.iconButton} type="button" aria-label="Metin düzenleme yardımı" aria-expanded={help} aria-controls="policy-help" onClick={() => setHelp(!help)}><Info aria-hidden="true" /></button><button className={`${styles.button} ${styles.splitButton}`} type="button" aria-pressed={split} onClick={() => { setSplit(!split); if (view === "preview") setView("edit"); }}><PanelLeftClose aria-hidden="true" />Yan yana</button></div>
              </div>
              {help ? <p className={styles.help} id="policy-help">Kaynak görünümünde HTML veya Markdown düzenleyebilirsiniz. Ctrl / ⌘ S ile kaydedin.</p> : null}
              <div className={`${styles.editorColumns} ${split ? styles.split : ""}`}>
                <div id="policy-source" role="tabpanel" aria-labelledby={view === "source" ? "policy-tab-source" : "policy-tab-edit"} hidden={view === "preview" && !split}>
                  {view === "source" ? <><label className={styles.srOnly} htmlFor="policy-body-source">Metin kaynağı</label><textarea id="policy-body-source" className={styles.source} value={body} readOnly={!canManage || busy || loading} aria-invalid={tooLong || undefined} aria-describedby={tooLong ? "policy-body-error" : undefined} onChange={(event) => changeBody(event.target.value)} rows={18} spellCheck={false} /></> : <PolicyBodyField key={selected.key} value={body} readOnly={!canManage || busy || loading} onValueChange={changeBody} />}
                </div>
                <div id="policy-preview" role="tabpanel" className={styles.preview} aria-label="Markdown önizleme" aria-labelledby="policy-tab-preview" hidden={view !== "preview" && !split}>
                  <div className={styles.previewCaption}><Globe aria-hidden="true" /><span>Mağazadaki görünüm</span><small>Önizleme</small></div>
                  {hasContent ? <ProductDescriptionPreview source={body} /> : <div className={styles.emptyPreview}><DocumentArt preview /><strong>Önizleme burada görünür</strong>{canManage ? <button className={styles.button} type="button" onClick={() => { setView("edit"); setSplit(false); }}>Metin yaz</button> : null}</div>}
                </div>
              </div>
            </div>
            <div className={styles.editorMeta}><span>{view === "source" ? sourceFormat === "html" ? "HTML kaynağı" : "Markdown kaynağı" : "Biçimlendirilmiş metin"}</span><span>{new Intl.NumberFormat("tr-TR").format(body.length)} karakter</span></div>
            {tooLong ? <p id="policy-body-error" className={styles.validation} role="alert">Metin sınırı aşıldı. Kaydetmek için içeriği kısaltın (100 KB).</p> : null}
            <footer className={styles.savebar}><div className={styles.saveState} role="status" aria-live="polite">{busy ? "İşlem sürüyor…" : message || (publishEmpty ? "Yayınlamak için metin ekleyin." : dirty ? <><i className={styles.dirtyDot} />Kaydedilmemiş değişiklikler</> : <><Check aria-hidden="true" />Değişiklik yok</>)}</div><div className={styles.saveActions}><button className={`${styles.button} ${styles.footerClose}`} type="button" onClick={close} disabled={busy}>Kapat</button>{canManage && dirty ? <button className={styles.button} type="button" ref={revertRef} disabled={busy || !!recovery} onClick={() => dialogRef.current?.showModal()}><Undo2 aria-hidden="true" />Geri al</button> : null}{canManage ? <button className={`${styles.button} ${styles.primary}`} type="button" disabled={!canSave} onClick={() => void save()}>{busy ? "Kaydediliyor…" : "Kaydet"}</button> : null}</div></footer>
          </> : <div className={styles.emptyEditor}><DocumentArt /><strong>Metin seç</strong><p>Düzenlemek veya görüntülemek için listeden seçin.</p></div>}
        </section>
      </section> : null}
      <dialog className={styles.revertDialog} ref={dialogRef} aria-labelledby="policy-revert-title" onClose={() => queueMicrotask(() => (revertRef.current ?? closeRef.current)?.focus())}>
        <header><h2 id="policy-revert-title">Değişiklikleri geri al?</h2><button className={styles.iconButton} type="button" aria-label="Pencereyi kapat" onClick={() => dialogRef.current?.close()}><X aria-hidden="true" /></button></header>
        <p>Bu metnin kaydedilmemiş değişiklikleri silinir. Son kaydedilen sürüm açılır.</p>
        <footer><button className={styles.button} type="button" autoFocus onClick={() => dialogRef.current?.close()}>Vazgeç</button><button className={`${styles.button} ${styles.primary}`} type="button" onClick={revert}>Geri al</button></footer>
      </dialog>
    </div>
  </PanelPageShell>;
}
