"use client";
import { RestockTool } from "./RestockTool";
import { CartCaptureTool } from "./CartCaptureTool";
import { OrderBumpTool } from "./OrderBumpTool";
import type { EngagementPermissions } from "../promotions/PopupStudio";

import {
  createDefaultContactWidgetConfig,
  normalizeContactWidgetChannelValue,
  parseContactWidgetConfig,
  resolveContactWidgetHref,
  type ContactWidgetChannel,
  type ContactWidgetConfig,
  type MerchantAdminJson,
  type MerchantAdminRecord,
  type StorefrontDesignDestinationOption,
} from "@celebix/saas-contracts";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Check, ChevronRight, Clock3, Eye, FileText, GripVertical, Headset, Info, Instagram, Mail, MapPin, MessageCircle, Monitor, Phone, Plus, Send, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { MerchantAdminApiError, merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import { DesignResourceField } from "./design/DesignLinkField";
import styles from "./store-tools.module.css";

type Tab = "content" | "appearance" | "visibility";
type ChannelType = ContactWidgetChannel["type"];
type Issue = Readonly<{ tab: Tab; text: string; focus: string; channel?: ChannelType; hours?: boolean }>;
type ToolDialog = "channels" | "discard" | "reload";
const TABS: readonly { key: Tab; label: string }[] = [{ key: "content", label: "İçerik" }, { key: "appearance", label: "Görünüm" }, { key: "visibility", label: "Gösterim" }];
const CHANNELS: Readonly<Record<ChannelType, { label: string; placeholder: string; field: string; inputMode?: "tel" | "email" }>> = {
  whatsapp: { label: "WhatsApp", placeholder: "0555 123 45 67", field: "Telefon numarası", inputMode: "tel" },
  phone: { label: "Telefon", placeholder: "0555 123 45 67", field: "Telefon numarası", inputMode: "tel" },
  sms: { label: "SMS", placeholder: "0555 123 45 67", field: "Telefon numarası", inputMode: "tel" },
  email: { label: "E-posta", placeholder: "destek@magaza.com", field: "E-posta adresi", inputMode: "email" },
  instagram: { label: "Instagram", placeholder: "magazaniz", field: "Kullanıcı adı" },
  telegram: { label: "Telegram", placeholder: "magazaniz", field: "Kullanıcı adı" },
  messenger: { label: "Messenger", placeholder: "magazaniz", field: "Sayfa adı" },
  maps: { label: "Yol tarifi", placeholder: "Mağazanızın açık adresi", field: "Mağaza adresi" },
  contact_page: { label: "İletişim sayfası", placeholder: "", field: "Yayındaki sayfa" },
};
const PAGES = [{ key: "home", label: "Ana sayfa" }, { key: "products", label: "Ürünler" }, { key: "categories", label: "Kategori ve koleksiyon" }, { key: "content", label: "İçerik sayfaları" }, { key: "cart", label: "Sepet" }, { key: "search", label: "Arama" }] as const;
const DAYS = [{ key: 1, label: "Pzt", full: "Pazartesi" }, { key: 2, label: "Sal", full: "Salı" }, { key: 3, label: "Çar", full: "Çarşamba" }, { key: 4, label: "Per", full: "Perşembe" }, { key: 5, label: "Cum", full: "Cuma" }, { key: 6, label: "Cmt", full: "Cumartesi" }, { key: 0, label: "Paz", full: "Pazar" }] as const;
const ZONE_LABELS: Readonly<Record<string, string>> = { "Europe/Istanbul": "Türkiye · İstanbul", "Europe/Berlin": "Almanya · Berlin", "Europe/London": "Birleşik Krallık · Londra", "America/New_York": "ABD · New York", UTC: "Evrensel saat" };
const availableTimeZones = (() => {
  try { return [...new Set([...Object.keys(ZONE_LABELS), ...Intl.supportedValuesOf("timeZone")])]; }
  catch { return Object.keys(ZONE_LABELS); }
})();
const secondary = "button button-secondary";
const ghost = "button button-text";
const primary = "button button-primary";

function completeChannels(config: ContactWidgetConfig): ContactWidgetConfig {
  const missing = createDefaultContactWidgetConfig().channels.filter(channel => !config.channels.some(saved => saved.type === channel.type));
  return { ...config, channels: [...config.channels, ...missing] };
}
function currentRecord(records: readonly MerchantAdminRecord[]) {
  return records.filter(record => record.kind === "contact_widget" && record.status === "active").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.version - left.version)[0] ?? null;
}
function channelIssue(channel: ContactWidgetChannel) {
  if (!channel.value.trim()) return channel.enabled ? "Bilgiyi tamamlayın." : "";
  try { normalizeContactWidgetChannelValue(channel.type, channel.value); return ""; }
  catch { return CHANNELS[channel.type].field + " geçersiz."; }
}
function validationIssue(config: ContactWidgetConfig): Issue | null {
  for (const channel of config.channels) {
    const problem = channelIssue(channel);
    if (problem) return { tab: "content", channel: channel.type, focus: "channel-value-" + channel.type, text: CHANNELS[channel.type].label + ": " + problem };
    if (!channel.label.trim() || [...channel.label.trim()].length > 40) return { tab: "content", channel: channel.type, focus: "channel-label-" + channel.type, text: CHANNELS[channel.type].label + ": görünen adı kontrol edin." };
  }
  if (!config.title.trim()) return { tab: "content", focus: "tool-title", text: "Başlığı tamamlayın." };
  if (!config.buttonLabel.trim()) return { tab: "appearance", focus: "tool-button-label", text: "Buton metnini tamamlayın." };
  if (config.enabled && !config.channels.some(channel => channel.enabled)) return { tab: "content", focus: "tool-add-channel", text: "Balonu açmak için bir kanal ekleyin." };
  if (config.enabled && !config.devices.desktop && !config.devices.mobile) return { tab: "visibility", focus: "tool-tab-visibility", text: "En az bir cihaz seçin." };
  if (config.enabled && !config.pages.length) return { tab: "visibility", focus: "tool-tab-visibility", text: "En az bir sayfa seçin." };
  if (config.hours.enabled && !config.hours.days.length) return { tab: "visibility", focus: "tool-hours-enabled", hours: true, text: "Çalışma günlerini seçin." };
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(config.hours.opensAt) || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(config.hours.closesAt) || config.hours.opensAt === config.hours.closesAt) return { tab: "visibility", focus: "tool-opens-at", hours: true, text: "Açılış ve kapanış saatlerini kontrol edin." };
  for (const [value, limit, label, tab, focus] of [
    [config.title, 80, "Başlık", "content", "tool-title"],
    [config.greeting, 240, "Karşılama metni", "content", "tool-greeting"],
    [config.buttonLabel, 32, "Buton metni", "appearance", "tool-button-label"],
    [config.whatsappMessage, 300, "WhatsApp mesajı", "content", "tool-whatsapp-message"],
    [config.hours.outsideMessage, 240, "Mesai dışı metni", "visibility", "tool-outside-message"],
  ] as const) {
    if ([...value].length > limit) return { tab, focus, text: label + " en fazla " + limit + " karakter olabilir.", ...(focus === "tool-whatsapp-message" ? { channel: "whatsapp" as const } : {}), ...(tab === "visibility" ? { hours: true } : {}) };
  }
  try { new Intl.DateTimeFormat("tr-TR", { timeZone: config.hours.timeZone }); }
  catch { return { tab: "visibility", focus: "tool-time-zone", hours: true, text: "Saat dilimini kontrol edin." }; }
  return null;
}
function ChannelIcon({ type }: Readonly<{ type: ChannelType }>) {
  if (type === "whatsapp") return <img src="/icons/whatsapp-flaticon.png" alt="" width={20} height={20} aria-hidden="true" />;
  const Icon = type === "phone" ? Phone : type === "sms" ? MessageCircle : type === "email" ? Mail : type === "instagram" ? Instagram : type === "telegram" ? Send : type === "messenger" ? MessageCircle : type === "maps" ? MapPin : FileText;
  return <Icon size={20} aria-hidden="true" />;
}
function ToolArtwork({ store = false }: Readonly<{ store?: boolean }>) {
  return <svg className={styles.artwork} viewBox={store ? "0 0 180 100" : "0 0 180 144"} aria-hidden="true" focusable="false">
    {store ? <><ellipse cx="90" cy="86" rx="68" ry="11" className={styles.artMuted} /><path d="M52 42h78v38H52zM43 42h95l-9-23H52z" className={styles.artOutline} /><path d="m54 19-4 23m22-23-2 23m22-23v23m20-23 2 23m14-23 5 23" className={styles.artLines} /><path d="M61 52h20v17H61zM103 51h18v29h-18z" className={styles.artMuted} /><path d="M88 60h6m51-38 5-7m-2 21h9" className={styles.artAccent} /><path d="M23 80h16l-3-11H26z" className={styles.artOrange} /><path d="M30 69Q17 55 22 48Q33 53 30 69M30 69Q44 54 40 47Q28 52 30 69" className={styles.artLeaf} /></> : <><ellipse cx="90" cy="112" rx="74" ry="20" className={styles.artSoft} /><path d="M34 31h92a12 12 0 0 1 12 12v49a12 12 0 0 1-12 12H79l-22 17v-17H34a12 12 0 0 1-12-12V43a12 12 0 0 1 12-12z" className={styles.artOutline} /><path d="M46 59h63M46 75h42" className={styles.artDetail} /><circle cx="135" cy="90" r="23" className={styles.artOutline} /><path d="m127 90 5 5 11-12m2-62 4-9m8 18 9-3M29 124h11" className={styles.artAccent} /></>}
  </svg>;
}

export function StoreToolsConsole({ canManage, canReadCoupons, canCreateCoupon, timezone }: EngagementPermissions) {
  const [record, setRecord] = useState<MerchantAdminRecord | null>(null);
  const [baseline, setBaseline] = useState<ContactWidgetConfig>(() => createDefaultContactWidgetConfig());
  const [draft, setDraft] = useState<ContactWidgetConfig>(() => createDefaultContactWidgetConfig());
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false), [tab, setTab] = useState<Tab>("content"), [busy, setBusy] = useState(false), [reloading, setReloading] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [conflict, setConflict] = useState(false), [validationAttempted, setValidationAttempted] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop"), [previewOpen, setPreviewOpen] = useState(true), [previewOutside, setPreviewOutside] = useState(false);
  const [mobilePreviewVisible, setMobilePreviewVisible] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [cartCaptureOpen, setCartCaptureOpen] = useState(false);
  const [orderBumpOpen, setOrderBumpOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState<ContactWidgetConfig["pages"][number]>("home");
  const [openChannel, setOpenChannel] = useState<ChannelType | null>(null), [revealedChannel, setRevealedChannel] = useState<ChannelType | null>(null), [revealedHours, setRevealedHours] = useState(false);
  const [dialog, setDialog] = useState<ToolDialog | null>(null), [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const [dragging, setDragging] = useState<ChannelType | null>(null), [dropTarget, setDropTarget] = useState<ChannelType | null>(null);
  const [pages, setPages] = useState<readonly StorefrontDesignDestinationOption[]>([]), [pagesLoaded, setPagesLoaded] = useState(false), [pagesLoading, setPagesLoading] = useState(false), [pagesError, setPagesError] = useState(""), [pagesAttempted, setPagesAttempted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null), editorRef = useRef<HTMLFormElement>(null), dialogRef = useRef<HTMLDialogElement>(null), dialogTriggerRef = useRef<HTMLElement | null>(null), previewRef = useRef<HTMLElement>(null);
  const mountedRef = useRef(true), applyingRef = useRef(false), readingRef = useRef(false), pagesReadingRef = useRef(false);
  const dragRef = useRef<{ type: ChannelType; pointer?: number; startY?: number; moved: boolean; target: ChannelType | null } | null>(null);
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

  const loadPages = useCallback(async () => {
    if (pagesReadingRef.current) return;
    pagesReadingRef.current = true; setPagesAttempted(true); setPagesLoading(true); setPagesError("");
    try {
      const [records, languages] = await Promise.all([merchantAdminApi.records("page"), merchantAdminApi.records("language_setting")]);
      const activeLanguages = languages.filter(entry => entry.kind === "language_setting" && entry.status === "active");
      if (activeLanguages.length > 1) throw new Error("language_unavailable");
      const language = activeLanguages[0]?.config;
      const defaultLocale = language ? language.defaultLocale : "tr";
      if (typeof defaultLocale !== "string" || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(defaultLocale) || (language && (!Array.isArray(language.enabledLocales) || !language.enabledLocales.includes(defaultLocale)))) throw new Error("language_unavailable");
      const choices = records.flatMap(entry => {
        const slug = entry.config.slug;
        return entry.kind === "page" && entry.status === "active" && entry.config.published === true && (entry.config.locale ?? defaultLocale) === defaultLocale && typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 100
          ? [{ kind: "page" as const, resourceId: entry.id, label: entry.name, path: "/pages/" + slug }] : [];
      }).filter((entry, index, all) => all.findIndex(other => other.path === entry.path) === index).sort((left, right) => left.label.localeCompare(right.label, "tr"));
      if (!mountedRef.current) return;
      setPages(choices); setPagesLoaded(true);
    } catch { if (mountedRef.current) { setPagesLoaded(false); setPagesError("Yayındaki sayfalar yüklenemedi."); } }
    finally { pagesReadingRef.current = false; if (mountedRef.current) setPagesLoading(false); }
  }, []);
  const needsPages = open && (openChannel === "contact_page" || draft.channels.some(channel => channel.type === "contact_page" && channel.enabled));
  useEffect(() => { if (needsPages && !pagesAttempted) void loadPages(); }, [needsPages, pagesAttempted, loadPages]);

  useEffect(() => {
    if (!focusTarget) return;
    const target = document.getElementById(focusTarget.id);
    if (focusTarget.id === "tool-preview") target?.scrollIntoView({ block: "start" });
    target?.focus();
    setFocusTarget(null);
  }, [focusTarget]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !applyingRef.current && !readingRef.current) return;
      event.preventDefault(); event.returnValue = "";
    };
    const busyNavigation = (event: MouseEvent) => {
      if ((!applyingRef.current && !readingRef.current) || !(event.target instanceof Element)) return;
      if (event.target.closest("a[href]")) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", busyNavigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", busyNavigation, true); };
  }, [dirty]);

  function closeDialog(restore = true) {
    dialogRef.current?.close();
    setDialog(null);
    if (restore) dialogTriggerRef.current?.focus();
  }
  function showDialog(value: ToolDialog) {
    if (applyingRef.current || readingRef.current) return;
    dialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(value);
  }
  useEffect(() => {
    const element = dialogRef.current;
    if (dialog) {
      element?.showModal();
      element?.querySelector<HTMLElement>("[data-dialog-initial]")?.focus();
    }
    return () => { if (element?.open) element.close(); };
  }, [dialog]);

  const cancel = useCallback(() => {
    if (applyingRef.current || readingRef.current) return;
    setDraft(baseline); setError(""); setConflict(false); setValidationAttempted(false); setOpen(false); setOpenChannel(null); setRevealedChannel(null); setRevealedHours(false); setDialog(null); attemptRef.current = null;
    setFocusTarget({ id: "tool-edit-contact-widget" });
  }, [baseline]);
  function requestExit() {
    if (applyingRef.current || readingRef.current) return;
    if (dirty) showDialog("discard"); else cancel();
  }
  function startEditing(nextTab: Tab = "content") {
    setDraft(baseline); setTab(nextTab); setPreviewOpen(true); setPreviewOutside(false); setPreviewPage("home"); setMobilePreviewVisible(false); setError(""); setConflict(false); setValidationAttempted(false); setMessage(""); setOpenChannel(null); setRevealedChannel(null); setRevealedHours(false); setPagesAttempted(false); setPagesLoaded(false); setOpen(true); setFocusTarget({ id: "tool-tab-" + nextTab });
  }
  function change(transform: (config: ContactWidgetConfig) => ContactWidgetConfig) {
    if (locked || applyingRef.current || readingRef.current) return;
    setDraft(transform); if (!conflict) setError(""); setValidationAttempted(false);
  }
  function channelChange(type: ChannelType, patch: Partial<ContactWidgetChannel>) {
    change(config => ({ ...config, channels: config.channels.map(channel => channel.type === type ? { ...channel, ...patch } : channel) }));
  }
  function revealIssue(issue: Issue) {
    setTab(issue.tab); setError(issue.text + " Girişleriniz korunuyor.");
    if (issue.channel) { setOpenChannel(issue.channel); setRevealedChannel(issue.channel); }
    if (issue.hours) setRevealedHours(true);
    setFocusTarget({ id: issue.focus });
  }
  function moveChannel(type: ChannelType, direction: -1 | 1 | 0, target?: ChannelType) {
    if (locked || applyingRef.current || readingRef.current) return;
    const active = draft.channels.filter(channel => channel.enabled);
    const from = active.findIndex(channel => channel.type === type);
    const to = target ? active.findIndex(channel => channel.type === target) : from + direction;
    if (from < 0 || to < 0 || to >= active.length || from === to) return;
    const reordered = [...active], [moved] = reordered.splice(from, 1); reordered.splice(to, 0, moved!);
    change(config => { let index = 0; return { ...config, channels: config.channels.map(channel => channel.enabled ? reordered[index++]! : channel) }; });
    setMessage(CHANNELS[type].label + " " + (to + 1) + ". sıraya taşındı.");
    setFocusTarget({ id: "channel-open-" + type });
  }
  function stopDrag(commit: boolean) {
    const drag = dragRef.current; dragRef.current = null; setDragging(null); setDropTarget(null);
    if (commit && drag?.moved && drag.target) moveChannel(drag.type, 0, drag.target);
  }
  function startPointerDrag(event: ReactPointerEvent<HTMLButtonElement>, type: ChannelType) {
    if (event.button !== 0 || locked || !draft.channels.some(channel => channel.type === type && channel.enabled)) return;
    event.preventDefault();
    event.currentTarget.focus();
    dragRef.current = { type, pointer: event.pointerId, startY: event.clientY, moved: false, target: null };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (Math.abs(event.clientY - (drag.startY ?? event.clientY)) < 6 && !drag.moved) return;
    drag.moved = true; setDragging(drag.type);
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-channel-row]")?.dataset.channelRow as ChannelType | undefined;
    drag.target = target && draft.channels.some(channel => channel.type === target && channel.enabled) ? target : null;
    setDropTarget(drag.target);
  }
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage || applyingRef.current || readingRef.current || conflict) return;
    setValidationAttempted(true);
    const issue = validationIssue(draft); if (issue) { revealIssue(issue); return; }
    const pageChannel = draft.channels.find(channel => channel.type === "contact_page");
    if (pageChannel?.enabled && (!pagesLoaded || !pages.some(page => page.path === pageChannel.value))) {
      revealIssue({ tab: "content", channel: "contact_page", focus: "channel-value-contact_page", text: pagesLoading ? "Sayfalar yükleniyor; birazdan yeniden deneyin." : pagesError ? "Yayındaki sayfaları yeniden yükleyin." : "Yayındaki bir sayfayı seçin." }); return;
    }
    let config: ContactWidgetConfig;
    try {
      config = parseContactWidgetConfig({ ...draft, title: draft.title.trim(), greeting: draft.greeting.trim(), buttonLabel: draft.buttonLabel.trim(), whatsappMessage: draft.whatsappMessage.trim(), hours: { ...draft.hours, timeZone: draft.hours.timeZone.trim(), outsideMessage: draft.hours.outsideMessage.trim() }, channels: draft.channels.map(channel => ({ ...channel, label: channel.label.trim(), value: normalizeContactWidgetChannelValue(channel.type, channel.value) })) });
    } catch { setError("Alanları kontrol edin. Girişleriniz korunuyor."); return; }
    const value = { ...(record ? { recordId: record.id, expectedVersion: record.version } : {}), name: "İletişim balonu", config: config as unknown as Readonly<Record<string, MerchantAdminJson>>, status: "active" as const };
    const fingerprint = JSON.stringify(value);
    if (attemptRef.current?.fingerprint !== fingerprint) attemptRef.current = { fingerprint, operationId: globalThis.crypto.randomUUID() };
    applyingRef.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const saved = await merchantAdminApi.save("contact_widget", value, attemptRef.current.operationId);
      if (!mountedRef.current) return;
      setRecord({ id: saved.id, kind: "contact_widget", name: value.name, config: value.config, status: saved.status, version: saved.version, createdAt: record?.createdAt ?? saved.updatedAt, updatedAt: saved.updatedAt });
      setBaseline(config); setDraft(config); setOpen(false); setOpenChannel(null); setRevealedChannel(null); setRevealedHours(false); setMessage("Uygulandı."); setValidationAttempted(false); attemptRef.current = null; setFocusTarget({ id: "tool-edit-contact-widget" });
    } catch (caught) {
      if (!mountedRef.current) return;
      if (caught instanceof MerchantAdminApiError && caught.code === "version_conflict") { setConflict(true); setError("Ayarlar başka bir oturumda değişti. Girişleriniz korunuyor."); }
      else setError(caught instanceof MerchantAdminApiError ? caught.message + " Girişleriniz korunuyor; yeniden deneyin." : "Ayarlar uygulanamadı. Girişleriniz korunuyor; yeniden deneyin.");
    } finally { applyingRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function reloadCurrent() {
    if (applyingRef.current || readingRef.current) return;
    readingRef.current = true; setReloading(true);
    try {
      const saved = currentRecord(await merchantAdminApi.records("contact_widget"));
      const config = saved ? completeChannels(parseContactWidgetConfig(saved.config)) : createDefaultContactWidgetConfig();
      if (!mountedRef.current) return;
      setRecord(saved); setBaseline(config); setDraft(config); setConflict(false); setError(""); setValidationAttempted(false); setRevealedChannel(null); setRevealedHours(false); attemptRef.current = null; setPagesAttempted(false); setPagesLoaded(false);
    } catch { if (mountedRef.current) setError("Güncel ayarlar yüklenemedi. Girişleriniz korunuyor; yeniden deneyin."); }
    finally { readingRef.current = false; if (mountedRef.current) setReloading(false); }
  }
  function switchTab(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next]!.key); setFocusTarget({ id: "tool-tab-" + TABS[next]!.key });
  }
  const activeChannels = draft.channels.filter(channel => channel.enabled);
  const shownChannels = draft.channels.filter(channel => channel.enabled || channel.type === revealedChannel);
  const previewChannels = draft.channels.flatMap(channel => {
    if (!channel.enabled) return [];
    try {
      const href = resolveContactWidgetHref({ ...channel, value: normalizeContactWidgetChannelValue(channel.type, channel.value) }, draft, { productTitle: "Örnek ürün", productUrl: "https://magazaniz.example/products/ornek-urun" });
      return href ? [channel] : [];
    } catch { return []; }
  });
  const BubbleIcon = draft.icon === "headset" ? Headset : MessageCircle;
  const previewHidden = !draft.devices[previewDevice] ? "Bu cihazda kapalı." : !draft.pages.includes(previewPage) ? "Bu sayfada kapalı." : previewOutside && draft.hours.enabled && draft.hours.outsideBehavior === "hide" ? "Mesai dışında gizleniyor." : "";
  const summaryDevices = baseline.devices.desktop && baseline.devices.mobile ? "Mobil ve masaüstü" : baseline.devices.mobile ? "Mobil" : baseline.devices.desktop ? "Masaüstü" : "Cihaz seçilmedi";

  function channelSummary(channel: ContactWidgetChannel) {
    if (channel.type !== "contact_page") return channel.value || "Bilgi ekleyin";
    return pages.find(page => page.path === channel.value)?.label ?? (channel.value ? pagesLoading ? "Sayfalar yükleniyor" : "Sayfa artık seçilemiyor" : "Sayfa seçilmedi");
  }

  return <PanelPageShell><PanelPageHeader title="Mağaza araçları" /><div className={styles.workspace}>
    {message && !restockOpen && !cartCaptureOpen && !orderBumpOpen ? <p className={styles.status} role="status">{message}</p> : null}
    {!restockOpen && !cartCaptureOpen && !orderBumpOpen && (loading ? <div className={styles.toolSkeleton} role="status"><span /><div><span /><span /></div><span className={styles.skeletonButton} /><span className={styles.srOnly}>Mağaza araçları yükleniyor…</span></div>
      : loadError ? <div className={styles.feedback}><Info size={20} aria-hidden="true" /><div><p role="alert">{loadError}</p><button className={secondary} type="button" onClick={() => void load()}>Yeniden dene</button></div></div>
      : loaded && !open && !restockOpen ? <article className={styles.toolRow}>
        <ToolArtwork /><div className={styles.toolCopy}><h2>İletişim balonu</h2><p>Müşterileriniz size kolayca ulaşsın.</p><span>{baseline.enabled ? "Açık" : "Kapalı"} · {baseline.channels.filter(channel => channel.enabled).length} kanal · {summaryDevices}{!canManage ? " · Salt okunur" : ""}</span>
          <nav className={styles.toolLinks} aria-label="İletişim balonu bölümleri">{[{ key: "content", label: "Kanallar" }, ...TABS.slice(1)].map(item => <button key={item.key} className={ghost} type="button" onClick={() => startEditing(item.key as Tab)}>{item.label}<ChevronRight size={16} aria-hidden="true" /></button>)}</nav>
        </div><button id="tool-edit-contact-widget" ref={triggerRef} className={primary} type="button" data-tool-edit="contact_widget" onClick={() => startEditing()}>{canManage ? "Düzenle" : "Görüntüle"}<ArrowUpRight size={16} aria-hidden="true" /></button>
      </article> : null)}
    {!open && !cartCaptureOpen && !orderBumpOpen ? <RestockTool canManage={canManage} onOpenChange={setRestockOpen} /> : null}
    {!open && !restockOpen && !orderBumpOpen ? <CartCaptureTool canManage={canManage} canReadCoupons={canReadCoupons} canCreateCoupon={canCreateCoupon} timezone={timezone} onOpenChange={setCartCaptureOpen} /> : null}
    {!open && !restockOpen && !cartCaptureOpen ? <OrderBumpTool canManage={canManage} onOpenChange={setOrderBumpOpen} /> : null}
    {loaded && open ? <form ref={editorRef} onSubmit={apply} onKeyDown={event => { if (event.key === "Escape" && !dialog) { event.preventDefault(); requestExit(); } }} noValidate data-settings-dirty={dirty} className={styles.editor}>
      <header className={styles.contextBar}><div><button className={ghost + " " + styles.iconButton} type="button" data-tool-close disabled={busy || reloading} aria-label="Araçlara dön" onClick={requestExit}><ArrowLeft size={20} aria-hidden="true" /></button><h2>İletişim balonu</h2></div>
        <label className={styles.enabledControl}><span>{draft.enabled ? "Açık" : "Kapalı"}</span><span className={styles.switch}><input name="enabled" aria-label="İletişim balonu açık" type="checkbox" role="switch" disabled={locked} checked={draft.enabled} onChange={event => change(config => ({ ...config, enabled: event.target.checked }))} /><span /></span></label>
      </header>
      {!canManage ? <div className={styles.readOnly}><Info size={18} aria-hidden="true" /><p>Salt okunur · Ayarları ve önizlemeyi inceleyebilirsiniz.</p></div> : null}
      <div className={styles.tabs} role="tablist" aria-label="İletişim balonu ayarları">{TABS.map(({ key, label }, index) => <button type="button" key={key} id={"tool-tab-" + key} role="tab" aria-selected={tab === key} aria-controls={"tool-panel-" + key} tabIndex={tab === key ? 0 : -1} data-tool-tab={key} onKeyDown={event => switchTab(event, index)} onClick={() => setTab(key)}>{label}</button>)}</div>
      {error ? <div className={styles.feedback}><Info size={20} aria-hidden="true" /><div><p role="alert">{error}</p>{conflict ? <button className={secondary} type="button" data-tool-reload disabled={busy || reloading} onClick={() => showDialog("reload")}>{reloading ? "Yükleniyor…" : "Girişleri bırak, güncel ayarları yükle"}</button> : null}</div></div> : null}
      <div className={styles.contentGrid}>
        <div className={styles.fieldsPane}>
          <section id="tool-panel-content" role="tabpanel" aria-labelledby="tool-tab-content" hidden={tab !== "content"}>
            <fieldset disabled={locked} className={styles.fields}><legend className={styles.srOnly}>İçerik</legend><div className={styles.two}>
              <label htmlFor="tool-title">Başlık<input id="tool-title" name="title" value={draft.title} maxLength={80} onChange={event => change(config => ({ ...config, title: event.target.value }))} /></label>
              <label htmlFor="tool-greeting">Karşılama metni<input id="tool-greeting" name="greeting" value={draft.greeting} maxLength={240} onChange={event => change(config => ({ ...config, greeting: event.target.value }))} /></label>
            </div></fieldset>
            <div className={styles.section}><div className={styles.sectionHeading}><div><h3>Kanallar</h3><small>{activeChannels.length} seçili</small></div><button id="tool-add-channel" className={ghost} type="button" data-tool-add-channel disabled={locked || activeChannels.length === 9} aria-haspopup="dialog" onClick={() => showDialog("channels")}><Plus size={18} aria-hidden="true" />Kanal ekle</button></div>
              {shownChannels.length ? <div className={styles.channelList}>{shownChannels.map(channel => {
                const definition = CHANNELS[channel.type], expanded = openChannel === channel.type, index = activeChannels.findIndex(entry => entry.type === channel.type);
                const issue = (validationAttempted || channel.value.trim()) ? channelIssue(channel) : "";
                const page = pages.find(entry => entry.path === channel.value);
                const pageUnavailable = channel.type === "contact_page" && channel.enabled && channel.value && pagesLoaded && !page;
                const shownIssue = issue || (pageUnavailable ? "Sayfa artık seçilemiyor. Yayındaki bir sayfayı seçin." : "");
                return <article key={channel.type} className={styles.channel + (dragging === channel.type ? " " + styles.dragging : "") + (dropTarget === channel.type && dragging !== channel.type ? " " + styles.dropTarget : "")} data-channel-row={channel.type}>
                  <div className={styles.channelRow}>
                    <button className={ghost + " " + styles.grip} type="button" data-channel-drag={channel.type} aria-label={definition.label + " sıralama tutamacı"} disabled={locked || !channel.enabled} draggable={false}
                      onPointerDown={event => startPointerDrag(event, channel.type)} onPointerMove={pointerDrag} onPointerUp={() => stopDrag(true)} onPointerCancel={() => stopDrag(false)}
                      onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); moveChannel(channel.type, event.key === "ArrowUp" ? -1 : 1); } }}><GripVertical size={18} aria-hidden="true" /></button>
                    <button id={"channel-open-" + channel.type} className={styles.channelOpen} type="button" data-channel-open={channel.type} aria-expanded={expanded} aria-controls={"channel-detail-" + channel.type} disabled={busy || reloading} onClick={() => setOpenChannel(expanded ? null : channel.type)}>
                      <span className={styles.channelSymbol}><ChannelIcon type={channel.type} /></span><span className={styles.channelCopy}><strong>{definition.label}{!channel.enabled ? " · Kapalı" : ""}</strong><small className={shownIssue ? styles.fieldError : undefined}>{shownIssue || channelSummary(channel)}</small></span>
                    </button>
                    <div className={styles.orderButtons}><button className={ghost + " " + styles.iconButton} type="button" data-channel-up={channel.type} disabled={locked || index <= 0} aria-label={definition.label + " yukarı taşı"} onClick={() => moveChannel(channel.type, -1)}><ArrowUp size={16} aria-hidden="true" /></button><button className={ghost + " " + styles.iconButton} type="button" data-channel-down={channel.type} disabled={locked || index < 0 || index === activeChannels.length - 1} aria-label={definition.label + " aşağı taşı"} onClick={() => moveChannel(channel.type, 1)}><ArrowDown size={16} aria-hidden="true" /></button></div>
                  </div>
                  <div id={"channel-detail-" + channel.type} className={styles.channelDetail} hidden={!expanded}>
                    <fieldset disabled={locked} className={styles.fields}><legend className={styles.srOnly}>{definition.label} ayrıntıları</legend><div className={styles.two}>
                      <label htmlFor={"channel-label-" + channel.type}>Görünen ad<input id={"channel-label-" + channel.type} name={"channel-label-" + channel.type} value={channel.label} maxLength={40} onChange={event => channelChange(channel.type, { label: event.target.value })} /></label>
                      {channel.type === "contact_page" ? <div className={styles.pageField}>
                        <DesignResourceField id="channel-value-contact_page" label="Yayındaki sayfa" value={channel.value ? { kind: "page", resourceId: page?.resourceId ?? "saved-page" } : { kind: "none" }} destinations={pages} disabled={locked || pagesLoading || !pagesLoaded} emptyLabel={pagesLoading ? "Sayfalar yükleniyor…" : "Sayfa seçin"} invalid={!!shownIssue} describedBy="channel-help-contact_page" onChange={selected => { const chosen = selected.kind === "none" ? undefined : pages.find(entry => entry.resourceId === selected.resourceId); channelChange("contact_page", { value: chosen?.path ?? "" }); }} />
                        <small id="channel-help-contact_page" className={shownIssue ? styles.fieldError : undefined}>{shownIssue || (pagesLoaded && !pages.length ? "Yayındaki bir sayfa bulunamadı." : "")}</small>
                      </div> : <label htmlFor={"channel-value-" + channel.type}>{definition.field}<input id={"channel-value-" + channel.type} name={"channel-value-" + channel.type} inputMode={definition.inputMode} placeholder={definition.placeholder} value={channel.value} maxLength={320} aria-invalid={!!shownIssue} aria-describedby={"channel-help-" + channel.type} onChange={event => channelChange(channel.type, { value: event.target.value })} /><small id={"channel-help-" + channel.type} className={shownIssue ? styles.fieldError : undefined}>{shownIssue}</small></label>}
                    </div>
                    {channel.type === "whatsapp" ? <><label htmlFor="tool-whatsapp-message">Hazır mesaj<textarea id="tool-whatsapp-message" name="whatsappMessage" value={draft.whatsappMessage} maxLength={300} onChange={event => change(config => ({ ...config, whatsappMessage: event.target.value }))} /></label><label className={styles.checkRow}><input name="includeProductLink" type="checkbox" checked={draft.includeProductLink} onChange={event => change(config => ({ ...config, includeProductLink: event.target.checked }))} /><span>Ürün bağlantısını mesaja ekle</span></label></> : null}
                    </fieldset>
                    {channel.type === "contact_page" && pagesError ? <div className={styles.pageFeedback}><p role="alert">{pagesError}</p><button className={secondary} type="button" data-tool-pages-retry disabled={pagesLoading || busy || reloading} onClick={() => void loadPages()}>Yeniden dene</button></div> : null}
                    <div className={styles.detailFooter}><button className={ghost + " " + styles.danger} type="button" data-channel-remove={channel.type} disabled={locked || !channel.enabled} onClick={() => { channelChange(channel.type, { enabled: false }); setOpenChannel(null); setRevealedChannel(null); setMessage("Kanal kapatıldı. Bilgileri korunuyor."); setFocusTarget({ id: "tool-add-channel" }); }}>Kanalı kapat</button><button className={ghost} type="button" data-channel-done={channel.type} disabled={busy || reloading} onClick={() => { setOpenChannel(null); setFocusTarget({ id: "channel-open-" + channel.type }); }}>Tamam<Check size={16} aria-hidden="true" /></button></div>
                  </div>
                </article>;
              })}</div> : <div className={styles.emptyInline}><ToolArtwork /><div><h3>Bir kanal ekleyin</h3><p>WhatsApp, telefon veya diğer kanallar.</p></div></div>}
            </div>
          </section>
          <section id="tool-panel-appearance" role="tabpanel" aria-labelledby="tool-tab-appearance" hidden={tab !== "appearance"}>
            <fieldset disabled={locked} className={styles.fields}><legend className={styles.srOnly}>Görünüm</legend>
              <div><h3 className={styles.groupHeading}>Konum</h3><div className={styles.choiceGrid}>{(["bottom-right", "bottom-left"] as const).map(position => <button className={styles.choice} name="position" data-position-choice={position} key={position} type="button" aria-pressed={draft.position === position} onClick={() => change(config => ({ ...config, position }))}><span className={styles.miniPosition} data-position={position} /><span>{position === "bottom-right" ? "Sağ alt" : "Sol alt"}</span>{draft.position === position ? <Check size={16} aria-hidden="true" /> : null}</button>)}</div></div>
              <div><h3 className={styles.groupHeading}>Simge</h3><div className={styles.choiceGrid}>{(["message", "headset"] as const).map(icon => <button className={styles.choice} name="icon" data-icon-choice={icon} key={icon} type="button" aria-pressed={draft.icon === icon} onClick={() => change(config => ({ ...config, icon }))}>{icon === "message" ? <MessageCircle size={20} aria-hidden="true" /> : <Headset size={20} aria-hidden="true" />}<span>{icon === "message" ? "Mesaj" : "Kulaklık"}</span>{draft.icon === icon ? <Check size={16} aria-hidden="true" /> : null}</button>)}</div></div>
              <div><h3 className={styles.groupHeading}>Renk</h3><div className={styles.choiceGrid + " " + styles.themeGrid}>{(["brand", "light", "dark"] as const).map(theme => <button className={styles.choice} name="theme" data-theme-choice={theme} key={theme} type="button" aria-pressed={draft.theme === theme} onClick={() => change(config => ({ ...config, theme }))}><span className={styles.themeSwatch} data-theme={theme} /><span>{theme === "brand" ? "Mağaza rengi" : theme === "light" ? "Açık" : "Koyu"}</span>{draft.theme === theme ? <Check size={16} aria-hidden="true" /> : null}</button>)}</div></div>
              <label htmlFor="tool-button-label">Buton metni<input id="tool-button-label" name="buttonLabel" value={draft.buttonLabel} maxLength={32} onChange={event => change(config => ({ ...config, buttonLabel: event.target.value }))} /></label>
            </fieldset>
          </section>
          <section id="tool-panel-visibility" role="tabpanel" aria-labelledby="tool-tab-visibility" hidden={tab !== "visibility"}>
            <fieldset disabled={locked} className={styles.fields}><legend className={styles.srOnly}>Gösterim</legend>
              <div><h3 className={styles.groupHeading}>Cihazlar</h3><div className={styles.choiceGrid}>{(["desktop", "mobile"] as const).map(device => <button className={styles.choice} key={device} name={"device-" + device} type="button" aria-pressed={draft.devices[device]} onClick={() => change(config => ({ ...config, devices: { ...config.devices, [device]: !config.devices[device] } }))}>{device === "desktop" ? <Monitor size={20} aria-hidden="true" /> : <Smartphone size={20} aria-hidden="true" />}<span>{device === "desktop" ? "Masaüstü" : "Mobil"}</span>{draft.devices[device] ? <Check size={16} aria-hidden="true" /> : null}</button>)}</div></div>
              <div className={styles.section}><h3 className={styles.groupHeading}>Sayfalar</h3><div className={styles.visibilityGrid}>{PAGES.map(({ key, label }) => <label className={styles.visibilityRow} key={key}><span>{label}</span><input name={"page-" + key} type="checkbox" checked={draft.pages.includes(key)} onChange={event => change(config => ({ ...config, pages: event.target.checked ? [...config.pages, key] : config.pages.filter(page => page !== key) }))} /></label>)}</div><small>Ödeme ve hesap ekranlarında gösterilmez.</small></div>
              <div className={styles.section}><div className={styles.sectionHeading}><div><Clock3 size={20} aria-hidden="true" /><h3>Çalışma saatleri</h3></div><label className={styles.switch}><input id="tool-hours-enabled" name="hours-enabled" aria-label="Çalışma saatlerini kullan" type="checkbox" role="switch" checked={draft.hours.enabled} onChange={event => change(config => ({ ...config, hours: { ...config.hours, enabled: event.target.checked } }))} /><span /></label></div>
                <div className={styles.hours} hidden={!draft.hours.enabled && !revealedHours}>
                  <label htmlFor="tool-time-zone">Saat dilimi<select id="tool-time-zone" name="timeZone" value={draft.hours.timeZone} onChange={event => change(config => ({ ...config, hours: { ...config.hours, timeZone: event.target.value } }))}>{[...new Set([draft.hours.timeZone, ...availableTimeZones])].map(zone => <option key={zone} value={zone}>{ZONE_LABELS[zone] ?? zone.replaceAll("_", " ").split("/").join(" · ")}</option>)}</select></label>
                  <div><span className={styles.fieldLabel}>Günler</span><div className={styles.days} role="group" aria-label="Çalışma günleri">{DAYS.map(({ key, label, full }) => <button key={key} className={styles.day} name={"day-" + key} type="button" aria-label={full} aria-pressed={draft.hours.days.includes(key)} onClick={() => change(config => ({ ...config, hours: { ...config.hours, days: config.hours.days.includes(key) ? config.hours.days.filter(day => day !== key) : [...config.hours.days, key] } }))}>{label}</button>)}</div></div>
                  <div><div className={styles.two}><label htmlFor="tool-opens-at">Açılış<input id="tool-opens-at" name="opensAt" type="time" value={draft.hours.opensAt} onChange={event => change(config => ({ ...config, hours: { ...config.hours, opensAt: event.target.value } }))} /></label><label htmlFor="tool-closes-at">Kapanış<input id="tool-closes-at" name="closesAt" type="time" value={draft.hours.closesAt} onChange={event => change(config => ({ ...config, hours: { ...config.hours, closesAt: event.target.value } }))} /></label></div>{draft.hours.closesAt < draft.hours.opensAt ? <small>Kapanış ertesi gün.</small> : null}</div>
                  <label>Mesai dışında<select name="outsideBehavior" value={draft.hours.outsideBehavior} onChange={event => change(config => ({ ...config, hours: { ...config.hours, outsideBehavior: event.target.value as ContactWidgetConfig["hours"]["outsideBehavior"] } }))}><option value="message">Mesaj göster</option><option value="hide">Balonu gizle</option></select></label>
                  {draft.hours.outsideBehavior === "message" || (revealedHours && [...draft.hours.outsideMessage].length > 240) ? <label htmlFor="tool-outside-message">Mesai dışı metni<textarea id="tool-outside-message" name="outsideMessage" value={draft.hours.outsideMessage} maxLength={240} onChange={event => change(config => ({ ...config, hours: { ...config.hours, outsideMessage: event.target.value } }))} /></label> : null}
                </div>
              </div>
            </fieldset>
          </section>
          <button className={secondary + " " + styles.mobilePreviewTrigger} type="button" aria-expanded={mobilePreviewVisible} aria-controls="tool-preview" onClick={() => { const visible = !mobilePreviewVisible; setMobilePreviewVisible(visible); if (visible) setFocusTarget({ id: "tool-preview" }); }}><Eye size={18} aria-hidden="true" />{mobilePreviewVisible ? "Önizlemeyi gizle" : "Önizlemeyi göster"}</button>
        </div>
        <section id="tool-preview" ref={previewRef} tabIndex={-1} className={styles.previewPane} aria-label="Önizleme" data-tool-preview data-mobile-preview={mobilePreviewVisible}>
          <header className={styles.previewToolbar}><h3>Önizleme</h3><div className={styles.segmented} role="group" aria-label="Önizleme cihazı"><button type="button" aria-label="Masaüstü önizleme" aria-pressed={previewDevice === "desktop"} onClick={() => setPreviewDevice("desktop")}><Monitor size={18} aria-hidden="true" /></button><button type="button" aria-label="Mobil önizleme" aria-pressed={previewDevice === "mobile"} onClick={() => setPreviewDevice("mobile")}><Smartphone size={18} aria-hidden="true" /></button></div></header>
          <div className={styles.previewCanvas} data-device={previewDevice} data-position={draft.position}>
            <div className={styles.previewStore} aria-hidden="true"><div className={styles.storeAnnouncement} /><div className={styles.storeHeader}>Mağazanız</div><div className={styles.storeHero}><ToolArtwork store /></div><div className={styles.storeProducts}><span /><span /><span /></div></div>
            {previewHidden ? <div className={styles.previewNotice}><ToolArtwork /><strong>{previewHidden}</strong><small>Gösterim ayarlarından değiştirebilirsiniz.</small></div> : <div className={styles.previewWidget} data-theme={draft.theme}>
              {previewOpen ? <div className={styles.previewCard}><div className={styles.previewTitle}><strong>{draft.title || "İletişim"}</strong><button className={ghost + " " + styles.iconButton} type="button" aria-label="Önizleme balonunu kapat" onClick={() => setPreviewOpen(false)}><X size={18} aria-hidden="true" /></button></div>
                {draft.greeting ? <p>{draft.greeting}</p> : null}{previewOutside && draft.hours.enabled && draft.hours.outsideBehavior === "message" && draft.hours.outsideMessage ? <p>{draft.hours.outsideMessage}</p> : null}
                <div className={styles.previewLinks}>{previewChannels.length ? previewChannels.map(channel => <button type="button" key={channel.type} data-preview-channel={channel.type} aria-label={(channel.label || CHANNELS[channel.type].label) + " önizlemesi"}><span><ChannelIcon type={channel.type} />{channel.label || CHANNELS[channel.type].label}</span><ChevronRight size={16} aria-hidden="true" /></button>) : <p>Önizlemek için kanal ekleyin.</p>}</div>
              </div> : null}
              <button type="button" className={styles.previewLauncher} aria-label="Önizleme balonunu aç veya kapat" aria-expanded={previewOpen} onClick={() => setPreviewOpen(current => !current)}><BubbleIcon size={21} aria-hidden="true" /><span>{draft.buttonLabel}</span></button>
            </div>}
          </div>
          <p className={styles.previewHint}><Info size={16} aria-hidden="true" /><span>{draft.enabled ? "Önizleme" : "Balon kapalı · önizleme"}</span></p>
          <div className={styles.previewOptions}><select aria-label="Önizlenen sayfa" value={previewPage} onChange={event => setPreviewPage(event.target.value as typeof previewPage)}>{PAGES.map(page => <option key={page.key} value={page.key}>{page.label}</option>)}</select><label className={styles.checkRow}><input name="previewOutside" type="checkbox" checked={previewOutside} onChange={event => setPreviewOutside(event.target.checked)} /><span>Mesai dışı</span></label></div>
        </section>
      </div>
      <footer className={styles.footer}><span role="status">{!canManage ? "Salt okunur" : busy ? "Uygulanıyor…" : reloading ? "Yükleniyor…" : conflict ? "Güncel ayarları yükleyin" : dirty ? <><i className={styles.unsavedDot} />Kaydedilmedi</> : "Değişiklik yok"}</span><div><button className={ghost} type="button" data-tool-cancel disabled={busy || reloading} onClick={requestExit}>{canManage ? "Vazgeç" : "Kapat"}</button>{canManage ? <button className={primary} type="submit" data-tool-apply disabled={busy || reloading || conflict || (!!record && !dirty)}>{busy ? "Uygulanıyor…" : "Uygula"}{!busy ? <Check size={18} aria-hidden="true" /> : null}</button> : null}</div></footer>
    </form> : null}
    {dialog ? <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="tool-dialog-title" onCancel={event => { event.preventDefault(); closeDialog(); }}>
      <header><h2 id="tool-dialog-title">{dialog === "channels" ? "Kanal ekle" : dialog === "reload" ? "Güncel ayarları yükleyelim mi?" : "Değişiklikleri bırakalım mı?"}</h2>{dialog === "channels" ? <button className={ghost + " " + styles.iconButton} type="button" data-dialog-initial aria-label="Kanal seçimini kapat" onClick={() => closeDialog()}><X size={20} aria-hidden="true" /></button> : null}</header>
      {dialog === "channels" ? <><div className={styles.pickerHeading}><small>Bir kanal seçin.</small><small>{activeChannels.length}/9</small></div><div className={styles.pickerGrid}>{draft.channels.map(channel => <button className={styles.choice} key={channel.type} type="button" data-channel-add={channel.type} disabled={locked || channel.enabled} onClick={() => { channelChange(channel.type, { enabled: true }); closeDialog(false); setOpenChannel(channel.type); setRevealedChannel(null); setTab("content"); setFocusTarget({ id: "channel-label-" + channel.type }); }}><ChannelIcon type={channel.type} /><span><strong>{CHANNELS[channel.type].label}</strong><small>{channel.enabled ? "Eklendi" : channel.value ? "Bilgisi kayıtlı" : "Ekle"}</small></span>{channel.enabled ? <Check size={16} aria-hidden="true" /> : null}</button>)}</div></>
        : <><p>{dialog === "reload" ? "Bu ekrandaki girişler bırakılır. Yükleme başarısız olursa girişleriniz korunur." : "Kaydedilmeyen düzenlemeler kaldırılacak."}</p><div className={styles.dialogActions}><button className={primary} type="button" data-dialog-initial data-tool-keep-editing onClick={() => closeDialog()}>Düzenlemeye devam</button><button className={ghost} type="button" data-tool-discard onClick={() => { const action = dialog; closeDialog(false); if (action === "reload") void reloadCurrent(); else cancel(); }}>{dialog === "reload" ? "Güncel ayarları yükle" : "Değişiklikleri bırak"}</button></div></>}
    </dialog> : null}
  </div></PanelPageShell>;
}
