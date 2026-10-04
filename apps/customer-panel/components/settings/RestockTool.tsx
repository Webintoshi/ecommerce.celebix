"use client";

import { createDefaultRestockAlertsConfig, parseRestockAlertsConfig, type MerchantAdminRecord, type MerchantAdminJson, type RestockAlertsConfig } from "@celebix/saas-contracts";
import { ArrowLeft, ArrowUpRight, Bell, Check, Info, Mail, Monitor, Package, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MerchantAdminApiError, merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import styles from "./restock-frame.module.css";
import local from "./restock-tool.module.css";

type Stats = Readonly<{ awaitingConfirmation: number; pendingConfirmed: number; sent: number; failed: number; recent: readonly { productTitle: string; variantTitle: string; emailMask: string; status: string; error: string | null; createdAt: string }[] }>;
type Confirmation = "discard" | "reload";
const labels: Readonly<Record<string, string>> = { awaiting_confirmation: "Onay bekliyor", confirmed: "Stok bekliyor", notified: "Gönderildi", cancelled: "İptal edildi", expired: "Onay süresi doldu", failed: "Gönderilemedi" };
const primary = "button button-primary", secondary = "button button-secondary", ghost = "button button-text";
function currentRecord(records: readonly MerchantAdminRecord[]) {
  return records.filter(row => row.kind === "restock_alerts" && row.status === "active").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.version - left.version)[0] ?? null;
}
function recentDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date) : "";
}
function RestockArtwork({ product = false }: Readonly<{ product?: boolean }>) {
  return <svg className={local.artwork} viewBox="0 0 180 144" aria-hidden="true" focusable="false">
    <ellipse cx="91" cy="115" rx="74" ry="20" className={local.artPeach} />
    <path d="M35 58h75v55H35z" className={local.artOutline} /><path d="m35 58 17-20h58l-15 20M35 58l-12-13 29-7m43 20 15-20 13 14-13 6" className={local.artOutline} />
    <path d="M56 73h30M56 86h19" className={local.artDetail} /><path d="M123 94h36v25h-36zM123 95l18 13 18-13" className={local.artOutline} />
    {product ? <path d="m129 68 5 5 10-12" className={local.artAccent} /> : <><path d="M116 74c6-5 7-11 7-20a15 15 0 0 1 30 0c0 9 1 15 7 20h-44z" className={local.artOutline} /><path d="M132 82a6 6 0 0 0 12 0M138 35v-5m-24 12-6-4m51 4 6-4" className={local.artAccent} /></>}
  </svg>;
}

export function RestockTool({ canManage, onOpenChange }: Readonly<{ canManage: boolean; onOpenChange?: (open: boolean) => void }>) {
  const [record, setRecord] = useState<MerchantAdminRecord | null>(null), [baseline, setBaseline] = useState(createDefaultRestockAlertsConfig), [draft, setDraft] = useState(createDefaultRestockAlertsConfig);
  const [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState(""), [stats, setStats] = useState<Stats | null>(null), [statsError, setStatsError] = useState(""), [statsLoading, setStatsLoading] = useState(true);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [reloading, setReloading] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false), [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null), [invalidField, setInvalidField] = useState<string | null>(null), [focusTarget, setFocusTarget] = useState<string | null>(null), [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const dialogRef = useRef<HTMLDialogElement>(null), dialogTrigger = useRef<HTMLElement | null>(null), callbackRef = useRef(onOpenChange), openRef = useRef(false);
  const pending = useRef(false), reading = useRef(false), statsReading = useRef(false), mounted = useRef(true), attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const dirty = open && JSON.stringify(draft) !== JSON.stringify(baseline), locked = !canManage || busy || reloading;
  useEffect(() => { callbackRef.current = onOpenChange; }, [onOpenChange]);

  const refreshStats = useCallback(async () => {
    if (statsReading.current) return;
    statsReading.current = true; setStatsLoading(true); setStatsError("");
    try {
      const response = await fetch("/api/restock/stats", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw Error("stats_unavailable");
      const value = await response.json() as Stats;
      if (!Array.isArray(value.recent) || [value.awaitingConfirmation, value.pendingConfirmed, value.sent, value.failed].some(count => !Number.isSafeInteger(count) || count < 0)) throw Error("stats_invalid");
      if (mounted.current) setStats(value);
    } catch { if (mounted.current) setStatsError("Bildirim durumları yüklenemedi."); }
    finally { statsReading.current = false; if (mounted.current) setStatsLoading(false); }
  }, []);
  const load = useCallback(async () => {
    if (reading.current) return;
    reading.current = true; setBusy(true); setLoadError("");
    try {
      const saved = currentRecord(await merchantAdminApi.records("restock_alerts"));
      const config = saved ? parseRestockAlertsConfig(saved.config) : createDefaultRestockAlertsConfig();
      if (mounted.current) { setRecord(saved); setBaseline(config); setDraft(config); setLoaded(true); setConflict(false); setError(""); attempt.current = null; }
    } catch { if (mounted.current) setLoadError("Stok bildirimi ayarları yüklenemedi."); }
    finally { reading.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void load(); void refreshStats();
    return () => { mounted.current = false; if (openRef.current) { openRef.current = false; callbackRef.current?.(false); } };
  }, [load, refreshStats]);
  useEffect(() => { if (focusTarget) { document.getElementById(focusTarget)?.focus(); setFocusTarget(null); } }, [focusTarget]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || pending.current || (openRef.current && reading.current)) { event.preventDefault(); event.returnValue = ""; } };
    const busyNavigation = (event: MouseEvent) => { if ((pending.current || (openRef.current && reading.current)) && event.target instanceof window.Element && event.target.closest("a[href]")) { event.preventDefault(); event.stopImmediatePropagation(); } };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", busyNavigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", busyNavigation, true); };
  }, [dirty]);
  useEffect(() => {
    const element = dialogRef.current;
    if (confirmation) { element?.showModal(); element?.querySelector<HTMLElement>("[data-restock-keep-editing]")?.focus(); }
    return () => { if (element?.open) element.close(); };
  }, [confirmation]);

  function begin() {
    if (pending.current || reading.current) return;
    setDraft(baseline); setError(""); setConflict(false); setMessage(""); setInvalidField(null); setPreviewDevice("desktop"); setOpen(true); openRef.current = true; callbackRef.current?.(true); setFocusTarget("restock-back"); void refreshStats();
  }
  function finish() { setOpen(false); openRef.current = false; callbackRef.current?.(false); setFocusTarget("restock-edit"); }
  function cancel() {
    if (pending.current || reading.current) return;
    setDraft(baseline); setError(""); setConflict(false); setInvalidField(null); attempt.current = null; finish();
  }
  function closeConfirmation(restore = true) { dialogRef.current?.close(); setConfirmation(null); if (restore) dialogTrigger.current?.focus(); }
  function confirm(kind: Confirmation) { if (pending.current || reading.current) return; dialogTrigger.current = document.activeElement instanceof window.HTMLElement ? document.activeElement : null; setConfirmation(kind); }
  function requestExit() { if (pending.current || reading.current) return; if (dirty) confirm("discard"); else cancel(); }
  function change(patch: Partial<RestockAlertsConfig>) { if (locked || pending.current || reading.current) return; setDraft(value => ({ ...value, ...patch })); if (!conflict) setError(""); setInvalidField(null); }
  async function reloadCurrent() {
    if (pending.current || reading.current) return;
    reading.current = true; setReloading(true);
    try {
      const saved = currentRecord(await merchantAdminApi.records("restock_alerts"));
      const config = saved ? parseRestockAlertsConfig(saved.config) : createDefaultRestockAlertsConfig();
      if (!mounted.current) return;
      setRecord(saved); setBaseline(config); setDraft(config); setConflict(false); setError(""); setInvalidField(null); attempt.current = null;
    } catch { if (mounted.current) setError("Güncel ayarlar yüklenemedi. Girişleriniz korunuyor; yeniden deneyin."); }
    finally { reading.current = false; if (mounted.current) setReloading(false); }
  }
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage || pending.current || reading.current || conflict) return;
    let config: RestockAlertsConfig;
    try { config = parseRestockAlertsConfig({ ...draft, title: draft.title.trim(), buttonLabel: draft.buttonLabel.trim() }); }
    catch {
      let field = "restock-title";
      try { parseRestockAlertsConfig({ ...draft, title: draft.title.trim(), buttonLabel: baseline.buttonLabel }); field = "restock-button"; } catch { /* The title must be corrected first. */ }
      setInvalidField(field); setError("Başlığı ve buton metnini kontrol edin. Girişleriniz korunuyor."); setFocusTarget(field); return;
    }
    const value = { ...(record ? { recordId: record.id, expectedVersion: record.version } : {}), name: "Stok gelince haber ver", config: config as unknown as Record<string, MerchantAdminJson>, status: "active" as const }, fingerprint = JSON.stringify(value);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const result = await merchantAdminApi.save("restock_alerts", value, attempt.current.id);
      if (!mounted.current) return;
      setRecord({ id: result.id, kind: "restock_alerts", name: value.name, status: result.status, config: value.config, version: result.version, createdAt: record?.createdAt ?? result.updatedAt, updatedAt: result.updatedAt });
      setBaseline(config); setDraft(config); setInvalidField(null); setMessage("Uygulandı."); attempt.current = null; finish(); void refreshStats();
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof MerchantAdminApiError && caught.code === "version_conflict") { setConflict(true); setError("Ayarlar başka bir oturumda değişti. Girişleriniz korunuyor."); }
      else setError("Ayarlar uygulanamadı. Girişleriniz korunuyor; yeniden deneyin.");
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const statsFeedback = statsError ? <div className={styles.feedback}><Info size={18} aria-hidden="true" /><div><p role="alert">{statsError}</p><button className={secondary} type="button" data-restock-stats-retry disabled={statsLoading || busy || reloading} onClick={() => void refreshStats()}>Yeniden dene</button></div></div> : statsLoading ? <p className={styles.status} role="status">Bildirim durumları yükleniyor…</p> : null;

  return <div className={styles.workspace} data-restock-open={open}>
    {message ? <p className={styles.status} role="status">{message}</p> : null}
    {!open ? <>
      {!loaded ? <div className={styles.toolSkeleton}>{loadError ? <div className={styles.feedback}><Info size={20} aria-hidden="true" /><div><p role="alert">{loadError}</p><button className={secondary} type="button" disabled={busy} onClick={() => void load()}>Yeniden dene</button></div></div> : <><span /><div><span /><span /></div><span className={styles.skeletonButton} /><span className={styles.srOnly}>Stok bildirimi yükleniyor…</span></>}</div> : <article className={styles.toolRow}>
        <RestockArtwork /><div className={styles.toolCopy}><h2>Stok gelince haber ver</h2><p>Tükenen ürün için tek seferlik e-posta.</p><span>{baseline.enabled ? "Açık" : "Kapalı"} · {stats?.pendingConfirmed ?? "—"} stok bekliyor · {stats?.sent ?? "—"} gönderildi{!canManage ? " · Salt okunur" : ""}</span></div>
        <button id="restock-edit" className={primary} type="button" data-tool-edit="restock_alerts" onClick={begin}>{canManage ? "Düzenle" : "Görüntüle"}<ArrowUpRight size={16} aria-hidden="true" /></button>
      </article>}
      {statsFeedback}
    </> : <form className={styles.editor} onSubmit={event => void apply(event)} onKeyDown={event => { if (event.key === "Escape" && !confirmation) { event.preventDefault(); requestExit(); } }} noValidate data-settings-dirty={dirty}>
      <header className={styles.contextBar}><div><button id="restock-back" className={ghost + " " + styles.iconButton} type="button" data-restock-back disabled={busy || reloading} aria-label="Araçlara dön" onClick={requestExit}><ArrowLeft size={20} aria-hidden="true" /></button><h2>Stok gelince haber ver</h2></div><label className={styles.enabledControl}><span>{draft.enabled ? "Açık" : "Kapalı"}</span><span className={styles.switch}><input name="restock-enabled" aria-label="Stok bildirimi açık" type="checkbox" role="switch" disabled={locked} checked={draft.enabled} onChange={event => change({ enabled: event.target.checked })} /><span /></span></label></header>
      {!canManage ? <div className={styles.readOnly}><Info size={18} aria-hidden="true" /><p>Salt okunur · Ayarları ve önizlemeyi inceleyebilirsiniz.</p></div> : null}
      {error ? <div className={styles.feedback}><Info size={20} aria-hidden="true" /><div><p role="alert" id="restock-error">{error}</p>{conflict ? <button className={secondary} type="button" data-restock-reload disabled={busy || reloading} onClick={() => confirm("reload")}>{reloading ? "Yükleniyor…" : "Girişleri bırak, güncel ayarları yükle"}</button> : null}</div></div> : null}
      <div className={styles.contentGrid}>
        <div className={styles.fieldsPane}><fieldset className={styles.fields} disabled={locked}><legend className={styles.srOnly}>Stok bildirimi ayarları</legend><div className={styles.two}>
          <label htmlFor="restock-title">Başlık<input id="restock-title" name="restock-title" maxLength={80} value={draft.title} aria-invalid={invalidField === "restock-title" || undefined} aria-describedby={invalidField === "restock-title" ? "restock-error" : undefined} onChange={event => change({ title: event.target.value })} /></label>
          <label htmlFor="restock-button">Buton metni<input id="restock-button" name="restock-button" maxLength={32} value={draft.buttonLabel} aria-invalid={invalidField === "restock-button" || undefined} aria-describedby={invalidField === "restock-button" ? "restock-error" : undefined} onChange={event => change({ buttonLabel: event.target.value })} /></label>
        </div></fieldset>
          <div className={local.flow} aria-label="Bildirim akışı"><span><Mail size={18} aria-hidden="true" />E-postayla onay</span><span><Package size={18} aria-hidden="true" />Seçilen varyant stokta</span><span><Bell size={18} aria-hidden="true" />Tek bildirim</span></div>
          <p className={local.help}>Stok ayırmaz; pazarlama aboneliği oluşturmaz.</p>
          <section className={local.operations} aria-labelledby="restock-status-heading"><header><h3 id="restock-status-heading">Bildirim durumu</h3><button className={ghost} type="button" data-restock-refresh disabled={statsLoading || busy || reloading} onClick={() => void refreshStats()}><RefreshCw size={16} aria-hidden="true" />Yenile</button></header>{statsFeedback}
            {stats ? <><dl className={local.counts}>{[[stats.awaitingConfirmation, "Onay bekliyor"], [stats.pendingConfirmed, "Stok bekliyor"], [stats.sent, "Gönderildi"], [stats.failed, "Gönderilemedi"]].map(([count, label]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
              <h4>Son bildirimler</h4>{stats.recent.length ? <ul className={local.recent}>{stats.recent.map((row, index) => <li key={`${row.createdAt}-${index}`}><div><strong>{row.productTitle}</strong><span>{row.variantTitle} · {row.emailMask}</span><time dateTime={row.createdAt}>{recentDate(row.createdAt)}</time></div><div className={local.result}><span>{labels[row.status] ?? "Bekliyor"}</span>{row.error ? <small>{row.error === "idempotency_window_expired" ? "Sonuç kesinleştirilemedi; yeniden gönderilmedi." : "Gönderim tamamlanamadı."}</small> : null}</div></li>)}</ul> : <div className={local.empty}><RestockArtwork /><p>Henüz bildirim isteği yok.</p></div>}
            </> : null}
          </section>
        </div>
        <section className={styles.previewPane} aria-label="Stok bildirimi önizlemesi"><header className={styles.previewToolbar}><h3>Önizleme</h3><div className={styles.segmented} role="group" aria-label="Önizleme cihazı">{(["desktop", "mobile"] as const).map(device => <button key={device} type="button" data-restock-device={device} aria-label={device === "desktop" ? "Masaüstü önizleme" : "Mobil önizleme"} aria-pressed={previewDevice === device} onClick={() => setPreviewDevice(device)}>{device === "desktop" ? <Monitor size={18} aria-hidden="true" /> : <Smartphone size={18} aria-hidden="true" />}</button>)}</div></header>
          <div className={local.preview} data-restock-preview data-device={previewDevice}><div className={local.storeHeader}>Mağazanız</div><div className={local.productArtwork}><RestockArtwork product /></div><div className={local.product}><small>Örnek ürün</small><h3>Kırmızı / M</h3><span>Tükendi</span></div><div className={local.alert}><div><Bell size={20} aria-hidden="true" /><strong>{draft.title || "Stok gelince haber ver"}</strong></div><label>E-posta<input type="email" placeholder="musteri@ornek.com" disabled /></label><label className={local.consent}><input type="checkbox" checked disabled readOnly /><span>Bu seçenek stokta olduğunda bir kez e-posta almak istiyorum.</span></label><button className={primary} type="button" data-preview-submit disabled>{draft.buttonLabel || "Bana haber ver"}</button></div></div>
          <p className={styles.previewHint}><Info size={16} aria-hidden="true" /><span>{draft.enabled ? "Önizleme" : "Bildirim kapalı · önizleme"}</span></p>
        </section>
      </div>
      <footer className={styles.footer}><span role="status">{!canManage ? "Salt okunur" : busy ? "Uygulanıyor…" : reloading ? "Yükleniyor…" : conflict ? "Güncel ayarları yükleyin" : dirty ? <><i className={styles.unsavedDot} />Kaydedilmedi</> : "Değişiklik yok"}</span><div><button className={ghost} type="button" data-restock-cancel disabled={busy || reloading} onClick={requestExit}>{canManage ? "Vazgeç" : "Kapat"}</button>{canManage ? <button className={primary} type="submit" data-restock-apply disabled={busy || reloading || conflict || (!!record && !dirty)}>{busy ? "Uygulanıyor…" : "Uygula"}{!busy ? <Check size={18} aria-hidden="true" /> : null}</button> : null}</div></footer>
    </form>}
    {confirmation ? <dialog className={styles.dialog} ref={dialogRef} data-restock-dialog aria-labelledby="restock-confirm-title" onCancel={event => { event.preventDefault(); closeConfirmation(); }}><h2 id="restock-confirm-title">{confirmation === "reload" ? "Güncel ayarları yükleyelim mi?" : "Değişiklikleri bırakalım mı?"}</h2><p>{confirmation === "reload" ? "Bu ekrandaki girişler bırakılır. Yükleme başarısız olursa girişleriniz korunur." : "Kaydedilmeyen düzenlemeler kaldırılacak."}</p><div className={styles.dialogActions}><button className={primary} type="button" data-restock-keep-editing onClick={() => closeConfirmation()}>Düzenlemeye devam</button><button className={ghost} type="button" data-restock-discard onClick={() => { const action = confirmation; closeConfirmation(false); if (action === "reload") void reloadCurrent(); else cancel(); }}>{confirmation === "reload" ? "Güncel ayarları yükle" : "Değişiklikleri bırak"}</button></div></dialog> : null}
  </div>;
}
