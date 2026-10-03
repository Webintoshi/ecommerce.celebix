"use client";

import {
  createDefaultContactWidgetConfig,
  normalizeContactWidgetChannelValue,
  parseContactWidgetConfig,
  resolveContactWidgetHref,
  type ContactWidgetChannel,
  type ContactWidgetConfig,
  type MerchantAdminJson,
  type MerchantAdminRecord,
} from "@celebix/saas-contracts";
import { ArrowDown, ArrowUp, ArrowUpRight, Headset, MessageCircle, Monitor, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { MerchantAdminApiError, merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import styles from "./store-tools.module.css";

type Tab = "content" | "appearance" | "visibility";
type ChannelType = ContactWidgetChannel["type"];
const TABS: readonly { key: Tab; label: string }[] = [{ key: "content", label: "İçerik" }, { key: "appearance", label: "Görünüm" }, { key: "visibility", label: "Gösterim" }];
const CHANNELS: Readonly<Record<ChannelType, { label: string; placeholder: string; help: string; inputMode?: "tel" | "email" }>> = {
  whatsapp: { label: "WhatsApp", placeholder: "+90 555 123 45 67", help: "Ülke koduyla telefon numarası", inputMode: "tel" },
  phone: { label: "Telefon", placeholder: "+90 555 123 45 67", help: "Ülke koduyla telefon numarası", inputMode: "tel" },
  sms: { label: "SMS", placeholder: "+90 555 123 45 67", help: "Ülke koduyla telefon numarası", inputMode: "tel" },
  email: { label: "E-posta", placeholder: "destek@magaza.com", help: "E-posta adresi", inputMode: "email" },
  instagram: { label: "Instagram", placeholder: "magazaniz", help: "Instagram kullanıcı adı" },
  telegram: { label: "Telegram", placeholder: "magazaniz", help: "Telegram kullanıcı adı" },
  messenger: { label: "Messenger", placeholder: "magazaniz", help: "Messenger sayfa adı" },
  maps: { label: "Yol tarifi", placeholder: "Mağazanızın açık adresi", help: "Açık adres" },
  contact_page: { label: "İletişim sayfası", placeholder: "/pages/iletisim", help: "Yayındaki iletişim sayfanızın yolu" },
};
const PAGES = [{ key: "home", label: "Ana sayfa" }, { key: "products", label: "Ürünler" }, { key: "categories", label: "Kategoriler" }, { key: "content", label: "İçerik sayfaları" }, { key: "cart", label: "Sepet" }, { key: "search", label: "Arama" }] as const;
const DAYS = [{ key: 1, label: "Pzt" }, { key: 2, label: "Sal" }, { key: 3, label: "Çar" }, { key: 4, label: "Per" }, { key: 5, label: "Cum" }, { key: 6, label: "Cmt" }, { key: 0, label: "Paz" }] as const;

function completeChannels(config: ContactWidgetConfig): ContactWidgetConfig {
  const missing = createDefaultContactWidgetConfig().channels.filter(channel => !config.channels.some(saved => saved.type === channel.type));
  return { ...config, channels: [...config.channels, ...missing] };
}
function currentRecord(records: readonly MerchantAdminRecord[]) {
  return records.filter(record => record.kind === "contact_widget" && record.status === "active").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.version - left.version)[0] ?? null;
}
function channelIssue(channel: ContactWidgetChannel) {
  if (!channel.value.trim()) return channel.enabled ? "Bağlantı bilgisini girin." : "";
  try { normalizeContactWidgetChannelValue(channel.type, channel.value); return ""; }
  catch { return `${CHANNELS[channel.type].help} geçersiz.`; }
}
function validationMessage(config: ContactWidgetConfig) {
  if (config.channels.some(channel => channelIssue(channel))) return "Kanal bilgilerini kontrol edin. Girişleriniz korunuyor.";
  if (config.enabled && !config.channels.some(channel => channel.enabled)) return "Balonu açmak için en az bir iletişim kanalı seçin.";
  if (config.enabled && !config.devices.desktop && !config.devices.mobile) return "En az bir cihaz seçin.";
  if (config.enabled && !config.pages.length) return "En az bir sayfa türü seçin.";
  if (config.hours.enabled && !config.hours.days.length) return "Çalışma günlerini seçin.";
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(config.hours.opensAt) || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(config.hours.closesAt)) return "Açılış ve kapanış saatlerini girin.";
  if (config.hours.opensAt === config.hours.closesAt) return "Açılış ve kapanış saati farklı olmalı.";
  for (const [value, limit, label] of [[config.title, 80, "Başlık"], [config.greeting, 240, "Karşılama metni"], [config.buttonLabel, 32, "Buton metni"], [config.whatsappMessage, 300, "WhatsApp mesajı"], [config.hours.outsideMessage, 240, "Mesai dışı metni"]] as const) {
    if ([...value].length > limit) return `${label} en fazla ${limit} karakter olabilir.`;
  }
  try { new Intl.DateTimeFormat("tr-TR", { timeZone: config.hours.timeZone }); }
  catch { return "Geçerli bir saat dilimi girin. Örn. Europe/Istanbul."; }
  return "";
}

export function StoreToolsConsole({ canManage }: Readonly<{ canManage: boolean }>) {
  const [record, setRecord] = useState<MerchantAdminRecord | null>(null);
  const [baseline, setBaseline] = useState<ContactWidgetConfig>(() => createDefaultContactWidgetConfig());
  const [draft, setDraft] = useState<ContactWidgetConfig>(() => createDefaultContactWidgetConfig());
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false), [tab, setTab] = useState<Tab>("content"), [busy, setBusy] = useState(false), [reloading, setReloading] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [conflict, setConflict] = useState(false), [validationAttempted, setValidationAttempted] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop"), [previewOpen, setPreviewOpen] = useState(true), [previewOutside, setPreviewOutside] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null), closeRef = useRef<HTMLButtonElement>(null), modalRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true), applyingRef = useRef(false), readingRef = useRef(false);
  const attemptRef = useRef<{ fingerprint: string; operationId: string } | null>(null);
  const dirty = open && JSON.stringify(draft) !== JSON.stringify(baseline);
  const locked = !canManage || busy || reloading;

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const saved = currentRecord(await merchantAdminApi.records("contact_widget"));
      const config = saved ? completeChannels(parseContactWidgetConfig(saved.config)) : createDefaultContactWidgetConfig();
      if (!mountedRef.current) return;
      setRecord(saved); setBaseline(config); setDraft(config); setLoaded(true);
    } catch { if (mountedRef.current) setLoadError("Mağaza araçları yüklenemedi."); }
    finally { if (mountedRef.current) setLoading(false); }
  }, []);
  useEffect(() => { mountedRef.current = true; void load(); return () => { mountedRef.current = false; }; }, [load]);
  const cancel = useCallback(() => {
    if (applyingRef.current || readingRef.current) return;
    setDraft(baseline); setError(""); setConflict(false); setValidationAttempted(false); setOpen(false); attemptRef.current = null;
  }, [baseline]);
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current, ancestors: HTMLElement[] = [];
    let element: HTMLElement | null = modalRef.current;
    while (element?.parentElement) {
      for (const sibling of Array.from(element.parentElement.children)) if (sibling !== element && sibling instanceof window.HTMLElement && !sibling.inert) { sibling.inert = true; ancestors.push(sibling); }
      element = element.parentElement; if (element === document.body) break;
    }
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = overflow; ancestors.forEach(element => { element.inert = false; }); window.removeEventListener("keydown", escape); trigger?.focus(); };
  }, [open, cancel]);

  function change(transform: (config: ContactWidgetConfig) => ContactWidgetConfig) {
    if (locked || applyingRef.current || readingRef.current) return;
    setDraft(transform); setError(""); setValidationAttempted(false);
  }
  function channelChange(type: ChannelType, patch: Partial<ContactWidgetChannel>) { change(config => ({ ...config, channels: config.channels.map(channel => channel.type === type ? { ...channel, ...patch } : channel) })); }
  function moveChannel(index: number, direction: -1 | 1) {
    change(config => { const channels = [...config.channels], destination = index + direction; if (destination < 0 || destination >= channels.length) return config; [channels[index], channels[destination]] = [channels[destination]!, channels[index]!]; return { ...config, channels }; });
  }
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage || applyingRef.current || readingRef.current || conflict) return;
    setValidationAttempted(true);
    const issue = validationMessage(draft); if (issue) { setError(issue); return; }
    let config: ContactWidgetConfig;
    try { config = parseContactWidgetConfig({ ...draft, title: draft.title.trim(), greeting: draft.greeting.trim(), buttonLabel: draft.buttonLabel.trim(), whatsappMessage: draft.whatsappMessage.trim(), hours: { ...draft.hours, timeZone: draft.hours.timeZone.trim(), outsideMessage: draft.hours.outsideMessage.trim() }, channels: draft.channels.map(channel => ({ ...channel, label: channel.label.trim(), value: normalizeContactWidgetChannelValue(channel.type, channel.value) })) }); }
    catch { setError("Alanları kontrol edin. Girişleriniz korunuyor."); return; }
    const value = { ...(record ? { recordId: record.id, expectedVersion: record.version } : {}), name: "İletişim balonu", config: config as unknown as Readonly<Record<string, MerchantAdminJson>>, status: "active" as const };
    const fingerprint = JSON.stringify(value);
    if (attemptRef.current?.fingerprint !== fingerprint) attemptRef.current = { fingerprint, operationId: globalThis.crypto.randomUUID() };
    applyingRef.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const saved = await merchantAdminApi.save("contact_widget", value, attemptRef.current.operationId);
      if (!mountedRef.current) return;
      setRecord({ id: saved.id, kind: "contact_widget", name: value.name, config: value.config, status: saved.status, version: saved.version, createdAt: record?.createdAt ?? saved.updatedAt, updatedAt: saved.updatedAt });
      setBaseline(config); setDraft(config); setOpen(false); setMessage("Uygulandı."); setValidationAttempted(false); attemptRef.current = null;
    } catch (caught) {
      if (!mountedRef.current) return;
      if (caught instanceof MerchantAdminApiError && caught.code === "version_conflict") { setConflict(true); setError("Ayarlar başka bir oturumda değişti. Girişleriniz korunuyor."); }
      else setError(caught instanceof MerchantAdminApiError ? `${caught.message} Girişleriniz korunuyor; yeniden deneyin.` : "Ayarlar uygulanamadı. Girişleriniz korunuyor; yeniden deneyin.");
    } finally { applyingRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function reloadCurrent() {
    if (applyingRef.current || readingRef.current) return;
    readingRef.current = true; setReloading(true);
    try {
      const saved = currentRecord(await merchantAdminApi.records("contact_widget"));
      const config = saved ? completeChannels(parseContactWidgetConfig(saved.config)) : createDefaultContactWidgetConfig();
      if (!mountedRef.current) return;
      setRecord(saved); setBaseline(config); setDraft(config); setConflict(false); setError(""); setValidationAttempted(false); attemptRef.current = null;
    } catch { if (mountedRef.current) setError("Güncel ayarlar yüklenemedi. Girişleriniz korunuyor; yeniden deneyin."); }
    finally { readingRef.current = false; if (mountedRef.current) setReloading(false); }
  }
  function keepFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]') ?? []).filter(control => !control.closest("[hidden]") && !control.closest("fieldset:disabled") && control.tabIndex !== -1);
    const first = controls[0], last = controls.at(-1); if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function switchTab(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next]!.key); modalRef.current?.querySelector<HTMLButtonElement>(`[data-tool-tab="${TABS[next]!.key}"]`)?.focus();
  }
  const previewChannels = draft.channels.flatMap(channel => {
    if (!channel.enabled) return [];
    try { const href = resolveContactWidgetHref({ ...channel, value: normalizeContactWidgetChannelValue(channel.type, channel.value) }, draft, { productTitle: "Örnek ürün", productUrl: "https://magazaniz.example/products/ornek-urun" }); return href ? [{ ...channel, href }] : []; }
    catch { return []; }
  });
  const BubbleIcon = draft.icon === "headset" ? Headset : MessageCircle;
  const previewHidden = !draft.devices[previewDevice] || (previewOutside && draft.hours.enabled && draft.hours.outsideBehavior === "hide");

  return <PanelPageShell><PanelPageHeader title="Mağaza araçları" /><div className={styles.workspace}>
    {message ? <p className={styles.status} role="status">{message}</p> : null}
    {loading ? <div className={styles.toolSkeleton} role="status">Mağaza araçları yükleniyor…</div> : loadError ? <div className={styles.feedback}><p role="alert">{loadError}</p><button type="button" onClick={() => void load()}>Yeniden dene</button></div> : loaded ? <article className={styles.toolRow}>
      <MessageCircle size={24} aria-hidden="true" /><div className={styles.toolCopy}><h2>İletişim balonu</h2><p>Müşterilerinizin size ulaşacağı kanallar.</p><span>{baseline.enabled ? "Açık" : "Kapalı"}{!canManage ? " · Salt okunur" : ""}</span></div>
      <button ref={triggerRef} type="button" data-tool-edit="contact_widget" aria-haspopup="dialog" onClick={() => { setDraft(baseline); setTab("content"); setPreviewOpen(true); setError(""); setConflict(false); setValidationAttempted(false); setMessage(""); setOpen(true); }}>{canManage ? "Düzenle" : "Görüntüle"}<ArrowUpRight size={16} aria-hidden="true" /></button>
    </article> : null}
    {open ? <><div className={styles.backdrop} aria-hidden="true" onClick={cancel} /><div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="store-tool-dialog-title" onKeyDown={keepFocus}>
      <header className={styles.modalHeader}><h2 id="store-tool-dialog-title">İletişim balonu</h2><button ref={closeRef} type="button" data-tool-close disabled={busy || reloading} aria-label="Vazgeç ve kapat" onClick={cancel}><X size={20} aria-hidden="true" /></button></header>
      <form onSubmit={apply} noValidate data-settings-dirty={dirty} className={styles.editor}>
        <div className={styles.tabs} role="tablist" aria-label="İletişim balonu ayarları">{TABS.map(({ key, label }, index) => <button type="button" key={key} id={`tool-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`tool-panel-${key}`} tabIndex={tab === key ? 0 : -1} data-tool-tab={key} onKeyDown={event => switchTab(event, index)} onClick={() => setTab(key)}>{label}</button>)}</div>
        <div className={styles.modalBody}>
          {error ? <div className={styles.feedback}><p role="alert">{error}</p>{conflict ? <><p>Güncel ayarları yüklemek bu penceredeki değişiklikleri bırakır.</p><button type="button" data-tool-reload disabled={busy || reloading} onClick={() => void reloadCurrent()}>{reloading ? "Yükleniyor…" : "Girişleri bırak, güncel ayarları yükle"}</button></> : null}</div> : null}
          <div className={styles.contentGrid}>
            <div className={styles.fieldsPane}>
              <section id="tool-panel-content" role="tabpanel" aria-labelledby="tool-tab-content" hidden={tab !== "content"}>
                <fieldset disabled={locked} className={styles.fields}><legend className={styles.srOnly}>İçerik</legend>
                  <label className={styles.switchRow}><span>İletişim balonu açık</span><input name="enabled" type="checkbox" role="switch" checked={draft.enabled} onChange={event => change(config => ({ ...config, enabled: event.target.checked }))} /></label>
                  <label>Başlık<input name="title" value={draft.title} onChange={event => change(config => ({ ...config, title: event.target.value }))} /></label>
                  <label>Karşılama metni<input name="greeting" value={draft.greeting} onChange={event => change(config => ({ ...config, greeting: event.target.value }))} /></label>
                  <div className={styles.sectionHeading}><h3>İletişim kanalları</h3><small>Sırayı oklarla değiştirebilirsiniz.</small></div>
                  <div className={styles.channelList}>{draft.channels.map((channel, index) => {
                    const definition = CHANNELS[channel.type], issue = (validationAttempted || channel.value.trim()) ? channelIssue(channel) : "";
                    return <div className={styles.channel} key={channel.type}>
                      <div className={styles.channelTop}><label><input name={`channel-enabled-${channel.type}`} type="checkbox" checked={channel.enabled} onChange={event => channelChange(channel.type, { enabled: event.target.checked })} /><span>{definition.label}</span></label><div className={styles.orderButtons}><button type="button" data-channel-up={channel.type} disabled={locked || index === 0} aria-label={`${definition.label} yukarı taşı`} onClick={() => moveChannel(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button><button type="button" data-channel-down={channel.type} disabled={locked || index === draft.channels.length - 1} aria-label={`${definition.label} aşağı taşı`} onClick={() => moveChannel(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button></div></div>
                      <div className={styles.channelFields}><label><span>Etiket</span><input name={`channel-label-${channel.type}`} value={channel.label} onChange={event => channelChange(channel.type, { label: event.target.value })} /></label><label><span>{definition.help}</span><input name={`channel-value-${channel.type}`} inputMode={definition.inputMode} placeholder={definition.placeholder} value={channel.value} aria-invalid={!!issue} aria-describedby={`channel-help-${channel.type}`} onChange={event => channelChange(channel.type, { value: event.target.value })} /><small id={`channel-help-${channel.type}`} className={issue ? styles.fieldError : undefined}>{issue || (channel.type === "contact_page" ? "Yayındaki bir mağaza sayfası olmalı." : "")}</small></label></div>
                    </div>;
                  })}</div>
                  <label>WhatsApp hazır mesajı<input name="whatsappMessage" value={draft.whatsappMessage} onChange={event => change(config => ({ ...config, whatsappMessage: event.target.value }))} /></label>
                  <label className={styles.checkRow}><input name="includeProductLink" type="checkbox" checked={draft.includeProductLink} onChange={event => change(config => ({ ...config, includeProductLink: event.target.checked }))} /><span>Ürün sayfasında ürün bağlantısını mesaja ekle</span></label>
                </fieldset>
              </section>
              <section id="tool-panel-appearance" role="tabpanel" aria-labelledby="tool-tab-appearance" hidden={tab !== "appearance"}>
                <fieldset disabled={locked} className={styles.fields}><legend className={styles.srOnly}>Görünüm</legend>
                  <label>Konum<select name="position" value={draft.position} onChange={event => change(config => ({ ...config, position: event.target.value as ContactWidgetConfig["position"] }))}><option value="bottom-right">Sağ alt</option><option value="bottom-left">Sol alt</option></select></label>
                  <label>Simge<select name="icon" value={draft.icon} onChange={event => change(config => ({ ...config, icon: event.target.value as ContactWidgetConfig["icon"] }))}><option value="message">Mesaj</option><option value="headset">Kulaklık</option></select></label>
                  <label>Renk<select name="theme" value={draft.theme} onChange={event => change(config => ({ ...config, theme: event.target.value as ContactWidgetConfig["theme"] }))}><option value="brand">Mağaza rengi</option><option value="light">Açık</option><option value="dark">Koyu</option></select></label>
                  <label>Buton metni<input name="buttonLabel" value={draft.buttonLabel} onChange={event => change(config => ({ ...config, buttonLabel: event.target.value }))} /></label>
                </fieldset>
              </section>
              <section id="tool-panel-visibility" role="tabpanel" aria-labelledby="tool-tab-visibility" hidden={tab !== "visibility"}>
                <fieldset disabled={locked} className={styles.fields}><legend className={styles.srOnly}>Gösterim</legend>
                  <div className={styles.sectionHeading}><h3>Cihazlar</h3></div><div className={styles.choices}>{(["desktop", "mobile"] as const).map(device => <label key={device}><input name={`device-${device}`} type="checkbox" checked={draft.devices[device]} onChange={event => change(config => ({ ...config, devices: { ...config.devices, [device]: event.target.checked } }))} /><span>{device === "desktop" ? "Masaüstü" : "Mobil"}</span></label>)}</div>
                  <div className={styles.sectionHeading}><h3>Sayfalar</h3></div><div className={styles.choices}>{PAGES.map(({ key, label }) => <label key={key}><input name={`page-${key}`} type="checkbox" checked={draft.pages.includes(key)} onChange={event => change(config => ({ ...config, pages: event.target.checked ? [...config.pages, key] : config.pages.filter(page => page !== key) }))} /><span>{label}</span></label>)}</div>
                  <label className={styles.switchRow}><span>Çalışma saatleri</span><input name="hours-enabled" type="checkbox" role="switch" checked={draft.hours.enabled} onChange={event => change(config => ({ ...config, hours: { ...config.hours, enabled: event.target.checked } }))} /></label>
                  <div className={styles.hours} hidden={!draft.hours.enabled}>
                    <label>Saat dilimi<input name="timeZone" list="contact-widget-timezones" value={draft.hours.timeZone} onChange={event => change(config => ({ ...config, hours: { ...config.hours, timeZone: event.target.value } }))} /><datalist id="contact-widget-timezones"><option value="Europe/Istanbul" /><option value="Europe/Berlin" /><option value="Europe/London" /><option value="America/New_York" /><option value="UTC" /></datalist></label>
                    <div className={styles.days} role="group" aria-label="Çalışma günleri">{DAYS.map(({ key, label }) => <label key={key}><input name={`day-${key}`} type="checkbox" checked={draft.hours.days.includes(key)} onChange={event => change(config => ({ ...config, hours: { ...config.hours, days: event.target.checked ? [...config.hours.days, key] : config.hours.days.filter(day => day !== key) } }))} /><span>{label}</span></label>)}</div>
                    <div className={styles.timeFields}><label>Açılış<input name="opensAt" type="time" value={draft.hours.opensAt} onChange={event => change(config => ({ ...config, hours: { ...config.hours, opensAt: event.target.value } }))} /></label><label>Kapanış<input name="closesAt" type="time" value={draft.hours.closesAt} onChange={event => change(config => ({ ...config, hours: { ...config.hours, closesAt: event.target.value } }))} /></label></div>
                    <label>Mesai dışında<select name="outsideBehavior" value={draft.hours.outsideBehavior} onChange={event => change(config => ({ ...config, hours: { ...config.hours, outsideBehavior: event.target.value as ContactWidgetConfig["hours"]["outsideBehavior"] } }))}><option value="message">Mesaj göster</option><option value="hide">Balonu gizle</option></select></label>
                    {draft.hours.outsideBehavior === "message" ? <label>Mesai dışı metni<input name="outsideMessage" value={draft.hours.outsideMessage} onChange={event => change(config => ({ ...config, hours: { ...config.hours, outsideMessage: event.target.value } }))} /></label> : null}
                  </div>
                </fieldset>
              </section>
            </div>
            <section className={styles.previewPane} aria-label="Canlı önizleme" data-tool-preview>
              <div className={styles.previewToolbar}><h3>Önizleme</h3><div role="group" aria-label="Önizleme cihazı"><button type="button" aria-label="Masaüstü önizleme" aria-pressed={previewDevice === "desktop"} onClick={() => setPreviewDevice("desktop")}><Monitor size={17} aria-hidden="true" /></button><button type="button" aria-label="Mobil önizleme" aria-pressed={previewDevice === "mobile"} onClick={() => setPreviewDevice("mobile")}><Smartphone size={17} aria-hidden="true" /></button></div></div>
              <div className={styles.previewCanvas} data-device={previewDevice} data-position={draft.position}>
                <div className={styles.previewPlaceholder} aria-hidden="true"><span /><span /><div /><div /></div>
                {previewHidden ? <p className={styles.previewNotice}>Bu görünümde balon gizli.</p> : <div className={styles.previewWidget} data-theme={draft.theme}>
                  {previewOpen ? <div className={styles.previewCard}><strong>{draft.title || "İletişim"}</strong><p>{previewOutside && draft.hours.enabled ? draft.hours.outsideMessage : draft.greeting}</p><div className={styles.previewLinks}>{previewChannels.length ? previewChannels.map(channel => <button type="button" key={channel.type} data-preview-channel={channel.type} aria-label={`${channel.label || CHANNELS[channel.type].label} önizlemesi`} title={channel.href}>{channel.label || CHANNELS[channel.type].label}<ArrowUpRight size={16} aria-hidden="true" /></button>) : <span>Önizlemek için kanal ekleyin.</span>}</div></div> : null}
                  <button type="button" className={styles.previewLauncher} aria-label="Önizleme balonunu aç veya kapat" aria-expanded={previewOpen} onClick={() => setPreviewOpen(current => !current)}><BubbleIcon size={21} aria-hidden="true" /><span>{draft.buttonLabel}</span></button>
                </div>}
              </div>
              <p className={styles.previewHint}>{draft.enabled ? "Taslak önizleme · bağlantılar açılmaz" : "Balon kapalı · taslak önizleme"}</p>
              {draft.hours.enabled ? <label className={styles.checkRow}><input type="checkbox" checked={previewOutside} onChange={event => setPreviewOutside(event.target.checked)} /><span>Mesai dışını önizle</span></label> : null}
            </section>
          </div>
        </div>
        <footer className={styles.modalFooter}><span role="status">{!canManage ? "Salt okunur" : busy ? "Uygulanıyor…" : conflict ? "Güncel ayarları yükleyin" : dirty ? "Uygulanmamış değişiklikler" : ""}</span><div><button type="button" data-tool-cancel disabled={busy || reloading} onClick={cancel}>{canManage ? "Vazgeç" : "Kapat"}</button>{canManage ? <button type="submit" data-tool-apply className={styles.primary} disabled={busy || reloading || conflict || (!!record && !dirty)}>{busy ? "Uygulanıyor…" : "Uygula"}</button> : null}</div></footer>
      </form>
    </div></> : null}
  </div></PanelPageShell>;
}
