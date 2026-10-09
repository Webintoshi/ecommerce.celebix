'use client';

import { createDefaultOrderBumpSettings, parseOrderBumpSettings, type OrderBumpOption, type OrderBumpOptionsPage, type OrderBumpRule, type OrderBumpSettings, type OrderBumpWorkspace } from '@celebix/saas-contracts';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Info, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePanelChromeModel } from '@/components/panel/PanelLayoutClient';
import { OrderBumpsApiError, scopedOrderBumpsApi, type OrderBumpsApi, type OrderBumpOptionKind, type OrderBumpSaveInput } from '@/lib/order-bumps-ui/client';
import { DesignSettingsModal } from './design/DesignSettingsDrawer';
import { OrderBumpArtwork } from './OrderBumpArtwork';
import shared from './store-tools.module.css';
import styles from './order-bump-tool.module.css';

type Bounds = Readonly<Record<string, Readonly<{ min: string; max: string }>>>;
type Choices = Readonly<Record<string, OrderBumpOption>>;
type Picker = Readonly<{ ruleId: string; kind: OrderBumpOptionKind }>;
const keyOf = (kind: OrderBumpOptionKind, id: string) => `${kind}:${id}`;
const price = (value: number | null) => value === null ? '' : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value / 100);
function boundsFor(config: OrderBumpSettings): Bounds { return Object.fromEntries(config.rules.map(rule => [rule.id, { min: rule.minSubtotalCents === null ? '' : String(rule.minSubtotalCents / 100), max: rule.maxSubtotalCents === null ? '' : String(rule.maxSubtotalCents / 100) }])); }
function subtotal(value: string): number | null {
  const text = value.trim(); if (!text) return null;
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(text)) throw Error('subtotal');
  const [whole, decimal = ''] = text.replace(',', '.').split('.'), cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 8_000_000_000) throw Error('subtotal'); return cents;
}
function moved<T>(items: readonly T[], index: number, direction: -1 | 1): readonly T[] { if (index + direction < 0 || index + direction >= items.length) return items; const next = [...items]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; return next; }

function ReferencePicker({ api, kind, selectedIds, limit, locked, onOptions, onSelect, onClose }: Readonly<{ api: OrderBumpsApi; kind: OrderBumpOptionKind; selectedIds: readonly string[]; limit: number; locked: boolean; onOptions(kind: OrderBumpOptionKind, items: readonly OrderBumpOption[]): void; onSelect(id: string): void; onClose(): void }>) {
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), [productId, setProductId] = useState<string | undefined>(), [data, setData] = useState<OrderBumpOptionsPage | null>(null), [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading'), [revision, setRevision] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const choosingProduct = kind === 'variant' && !productId, queryKind = choosingProduct ? 'product' : kind;
  useEffect(() => { searchInput.current?.focus(); searchInput.current?.scrollIntoView?.({ block: 'nearest' }); }, [productId]);
  useEffect(() => {
    const controller = new AbortController(); let active = true; setPhase('loading');
    const timer = window.setTimeout(() => { void api.options({ kind: queryKind, page, ...(search.trim() ? { search: search.trim() } : {}), ...(productId ? { productId } : {}) }, controller.signal).then(result => { if (!active) return; setData(result); onOptions(queryKind, result.items); setPhase('ready'); }).catch(() => { if (active && !controller.signal.aborted) setPhase('error'); }); }, 180);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [api, queryKind, productId, search, page, revision, onOptions]);
  const lastPage = data ? Math.max(1, Math.ceil(data.totalCount / 20)) : 1;
  return <section className={styles.picker} aria-label="Seçim listesi">
    <header><div><h4>{choosingProduct ? 'Ürünün seçeneklerini açın' : kind === 'variant' ? 'Önerilecek seçenekler' : kind === 'category' ? 'Kategori seçimi' : 'Ürün seçimi'}</h4><small>{choosingProduct ? 'Bir sonraki adımda seçeneği belirleyin.' : `${selectedIds.length}/${limit} seçili`}</small></div><button type="button" className="button button-text" disabled={locked} onClick={onClose}>Seçimi tamamla<Check size={16} aria-hidden="true" /></button></header>
    {kind === 'variant' && productId ? <button className="button button-text" type="button" disabled={locked} onClick={() => { setProductId(undefined); setSearch(''); setPage(1); }}>Başka ürün seç</button> : null}
    <label>Listede ara<input ref={searchInput} type="search" aria-label="Seçeneklerde ara" value={search} maxLength={100} disabled={locked} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
    {phase === 'loading' ? <p role="status">Seçenekler yükleniyor…</p> : phase === 'error' ? <div role="alert"><p>Seçenekler yüklenemedi. Seçimleriniz korunuyor.</p><button type="button" className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Seçenekleri yeniden yükle</button></div> : !data?.items.length ? <p>Aramaya uygun kayıt yok.</p> : <ul className={styles.optionList}>{data.items.map(item => <li key={item.id}><span><strong>{item.label}</strong><small>{!item.available ? 'Artık kullanılamıyor' : price(item.priceCents)}</small></span><button type="button" className="button button-secondary" disabled={locked || !item.available || (!choosingProduct && (selectedIds.includes(item.id) || selectedIds.length >= limit))} aria-label={item.label + (choosingProduct ? ' seçeneklerini göster' : ' seç')} onClick={() => { if (choosingProduct) { setProductId(item.id); setSearch(''); setPage(1); } else onSelect(item.id); }}>{choosingProduct ? 'Seçenekler' : selectedIds.includes(item.id) ? 'Seçildi' : 'Seç'}</button></li>)}</ul>}
    {phase === 'ready' && data ? <div className={styles.pagination}><span>{data.totalCount.toLocaleString('tr-TR')} kayıt · {page}/{lastPage}</span><div><button type="button" className="button button-text" disabled={locked || page === 1} onClick={() => setPage(value => value - 1)}>Önceki</button><button type="button" className="button button-text" disabled={locked || page >= lastPage} onClick={() => setPage(value => value + 1)}>Sonraki</button></div></div> : null}
  </section>;
}

export function OrderBumpTool({ canManage, onOpenChange }: Readonly<{ canManage: boolean; onOpenChange?: (open: boolean) => void }>) {
  const { storeSlug } = usePanelChromeModel(), api = useMemo(() => scopedOrderBumpsApi(storeSlug), [storeSlug]), router = useRouter();
  const [workspace, setWorkspace] = useState<OrderBumpWorkspace | null>(null), [draft, setDraft] = useState<OrderBumpSettings>(createDefaultOrderBumpSettings), [bounds, setBounds] = useState<Bounds>({});
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading'), [revision, setRevision] = useState(0), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [reloading, setReloading] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [conflict, setConflict] = useState(false), [uncertain, setUncertain] = useState(false), [recovery, setRecovery] = useState<OrderBumpSaveInput | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false), [validation, setValidation] = useState<Readonly<Record<string, string>>>({});
  const [destination, setDestination] = useState<string | null>(null);
  const [activeRule, setActiveRule] = useState<string | null>(null), [picker, setPicker] = useState<Picker | null>(null), [choices, setChoices] = useState<Choices>({}), [choiceError, setChoiceError] = useState(''), [hydrationRevision, setHydrationRevision] = useState(0), [decision, setDecision] = useState<'discard' | 'reload' | null>(null);
  const trigger = useRef<HTMLButtonElement>(null), pickerTrigger = useRef<HTMLButtonElement | null>(null), hadPicker = useRef(false), editor = useRef<HTMLFormElement>(null), writing = useRef(false), reading = useRef(false), mounted = useRef(true), callback = useRef(onOpenChange), wasOpen = useRef(false), state = useRef({ dirty: false, uncertain: false, busy: false, pickerOpen: false });
  const dirty = open && (!!workspace && (JSON.stringify(draft) !== JSON.stringify(workspace.config) || JSON.stringify(bounds) !== JSON.stringify(boundsFor(workspace.config))));
  state.current = { dirty, uncertain, busy: busy || reloading, pickerOpen: !!picker }; callback.current = onOpenChange;
  const locked = !canManage || busy || reloading || uncertain || conflict || storageBlocked;
  const selectedRule = draft.rules.find(rule => rule.id === activeRule);
  const remember = useCallback((kind: OrderBumpOptionKind, items: readonly OrderBumpOption[]) => { setChoices(current => ({ ...current, ...Object.fromEntries(items.map(item => [keyOf(kind, item.id), item])) })); }, []);
  useEffect(() => { if (wasOpen.current && !open) trigger.current?.focus(); wasOpen.current = open; }, [open]);
  useEffect(() => { if (hadPicker.current && !picker && open) pickerTrigger.current?.focus(); hadPicker.current = !!picker; }, [picker, open]);
  useEffect(() => { const first = Object.keys(validation)[0]; if (first) { const field = [...(editor.current?.querySelectorAll<HTMLElement>('[data-order-field]') ?? [])].find(control => control.dataset.orderField === first); field?.focus(); field?.scrollIntoView?.({ block: 'nearest' }); } }, [validation]);

  useEffect(() => {
    mounted.current = true; let active = true; const controller = new AbortController(); setPhase('loading'); setError(''); setChoices({});
    setStorageBlocked(!api.persistenceAvailable());
    try { const retained = api.pendingIntent(); setRecovery(retained); setUncertain(api.hasUnresolved()); if (retained) { setDraft(retained.config); setBounds(boundsFor(retained.config)); } }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Kayıt güvencesi okunamadı.'); setUncertain(api.hasUnresolved()); }
    void api.get(controller.signal).then(saved => { if (!active) return; setWorkspace(saved); if (!api.hasUnresolved()) { setDraft(saved.config); setBounds(boundsFor(saved.config)); } setPhase('ready'); }).catch(() => { if (active) setPhase('error'); });
    return () => { active = false; mounted.current = false; controller.abort(); };
  }, [api, revision]);
  const selectedIdentities = JSON.stringify(draft.rules.map(rule => ({ products: rule.productIds, categories: rule.categoryIds, variants: rule.variantIds })));
  useEffect(() => {
    if (!open) return; const controller = new AbortController(); let active = true; setChoiceError('');
    const groups = { product: [...new Set(draft.rules.flatMap(rule => rule.productIds))], category: [...new Set(draft.rules.flatMap(rule => rule.categoryIds))], variant: [...new Set(draft.rules.flatMap(rule => rule.variantIds))] };
    void Promise.all((Object.keys(groups) as OrderBumpOptionKind[]).flatMap(kind => { const ids = groups[kind]; const calls: Promise<void>[] = []; for (let start = 0; start < ids.length; start += 100) calls.push(api.options({ kind, ids: ids.slice(start, start + 100) }, controller.signal).then(result => { if (active) remember(kind, result.items); })); return calls; })).catch(() => { if (active && !controller.signal.aborted) setChoiceError('Seçili kayıtların bilgileri yüklenemedi. Seçimleriniz korunuyor.'); });
    return () => { active = false; controller.abort(); };
  }, [api, open, selectedIdentities, hydrationRevision, remember]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (state.current.dirty || state.current.uncertain || writing.current || reading.current) { event.preventDefault(); event.returnValue = ''; } };
    const busyNavigation = () => writing.current || reading.current || state.current.uncertain;
    const leaving = (url: URL) => url.origin === window.location.origin && (url.pathname !== window.location.pathname || url.search !== window.location.search);
    const askToLeave = (url: URL) => { setDestination(`${url.pathname}${url.search}${url.hash}`); setPicker(null); setDecision('discard'); };
    const navigationClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof window.Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]'); if (!anchor) return;
      if (busyNavigation()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (!state.current.dirty || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || anchor.target || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href); if (!leaving(url)) return;
      event.preventDefault(); event.stopPropagation(); askToLeave(url);
    };
    const navigation = (window as Window & { navigation?: { addEventListener(type: 'navigate', listener: (event: Event) => void): void; removeEventListener(type: 'navigate', listener: (event: Event) => void): void } }).navigation;
    const traverse = (raw: Event) => {
      const event = raw as Event & { navigationType?: string; destination?: { url: string; sameDocument: boolean } };
      if (event.defaultPrevented || event.navigationType !== 'traverse' || !event.cancelable || !event.destination?.sameDocument) return;
      const url = new URL(event.destination.url, window.location.href); if (!leaving(url)) return;
      if (busyNavigation()) event.preventDefault();
      else if (state.current.dirty) { event.preventDefault(); askToLeave(url); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigationClick, true); navigation?.addEventListener('navigate', traverse);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigationClick, true); navigation?.removeEventListener('navigate', traverse); };
  }, []);
  const finish = useCallback(() => { setOpen(false); setPicker(null); setDecision(null); setDestination(null); callback.current?.(false); }, []);
  const requestClose = useCallback(() => { if (writing.current || reading.current || state.current.uncertain) return; if (state.current.pickerOpen) { setPicker(null); return; } setDestination(null); if (state.current.dirty) setDecision('discard'); else finish(); }, [finish]);
  function begin() { if ((!workspace && !recovery) || writing.current || reading.current) return; const config = recovery?.config ?? workspace!.config; setDraft(config); setBounds(boundsFor(config)); setActiveRule(config.rules[0]?.id ?? null); setPicker(null); setDecision(null); setDestination(null); setNotice(''); setValidation({}); if (!uncertain && !conflict && !storageBlocked) setError(''); setOpen(true); callback.current?.(true); }
  function change(next: OrderBumpSettings) { if (locked || writing.current || reading.current) return; setDraft(next); setError(''); setValidation({}); }
  function changeRule(id: string, patch: Partial<OrderBumpRule>) { change({ ...draft, rules: draft.rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule) }); }
  function addRule() { if (locked || writing.current || reading.current || draft.rules.length >= 20) return; const id = crypto.randomUUID(), rule: OrderBumpRule = { id, name: `Kural ${draft.rules.length + 1}`, enabled: true, productIds: [], categoryIds: [], minSubtotalCents: null, maxSubtotalCents: null, variantIds: [] }; change({ ...draft, rules: [...draft.rules, rule] }); setBounds(current => ({ ...current, [id]: { min: '', max: '' } })); setActiveRule(id); }
  function openPicker(control: HTMLButtonElement, ruleId: string, kind: OrderBumpOptionKind) { if (locked || writing.current || reading.current) return; pickerTrigger.current = control; setPicker({ ruleId, kind }); }
  function fieldProps(key: string) { return { 'data-order-field': key, 'aria-invalid': !!validation[key], 'aria-describedby': validation[key] ? `order-bump-error-${key}` : undefined }; }
  function fieldError(key: string) { return validation[key] ? <span id={`order-bump-error-${key}`} className={styles.fieldError}>{validation[key]}</span> : null; }
  async function reload() {
    if (writing.current || reading.current || uncertain) return; reading.current = true; setReloading(true); setDecision(null);
    try { const saved = await api.get(); if (!mounted.current) return; setWorkspace(saved); setDraft(saved.config); setBounds(boundsFor(saved.config)); setRecovery(null); setConflict(false); setError(''); setValidation({}); setActiveRule(saved.config.rules[0]?.id ?? null); setPicker(null); }
    catch { if (mounted.current) setError('Güncel ayarlar yüklenemedi. Girişleriniz korunuyor; yeniden deneyin.'); }
    finally { reading.current = false; if (mounted.current) setReloading(false); }
  }
  async function apply() {
    if (!canManage || (storageBlocked && !recovery) || writing.current || reading.current || conflict || (!workspace && !recovery)) return;
    let intent: OrderBumpSaveInput;
    try {
      if (recovery) intent = recovery;
      else {
        const issues: Record<string, string> = {};
        if (!draft.heading.trim()) issues.heading = 'Bir başlık girin.';
        if (!draft.placements.sideCart && !draft.placements.checkout) issues.placements = 'En az bir gösterim yeri seçin.';
        const rules = draft.rules.map(rule => {
          if (!rule.name.trim()) issues[`${rule.id}:name`] = 'Bu kurala bir ad verin.';
          let min: number | null = null, max: number | null = null;
          try { min = subtotal(bounds[rule.id]?.min ?? ''); } catch { issues[`${rule.id}:min`] = 'Geçerli bir tutar girin; en fazla iki ondalık basamak kullanın.'; }
          try { max = subtotal(bounds[rule.id]?.max ?? ''); } catch { issues[`${rule.id}:max`] = 'Geçerli bir tutar girin; en fazla iki ondalık basamak kullanın.'; }
          if (min !== null && max !== null && min > max) issues[`${rule.id}:max`] = 'En çok tutarı, en az tutarından küçük olamaz.';
          if (!rule.variantIds.length) issues[`${rule.id}:variants`] = 'En az bir ürün seçeneği ekleyin.';
          return { ...rule, name: rule.name.trim(), minSubtotalCents: min, maxSubtotalCents: max };
        });
        if (Object.keys(issues).length) { const firstRule = draft.rules.find(rule => Object.keys(issues).some(key => key.startsWith(rule.id + ':'))); if (firstRule) setActiveRule(firstRule.id); setPicker(null); setValidation(issues); setError('İşaretli alanları kontrol edin. Girişleriniz korunuyor.'); return; }
        const config = parseOrderBumpSettings({ ...draft, heading: draft.heading.trim(), rules });
        intent = { expectedVersion: workspace!.version, config };
      }
    } catch { setError('Başlığı, tutar aralığını ve her kuraldaki önerilecek seçenekleri kontrol edin. Girişleriniz korunuyor.'); return; }
    writing.current = true; setBusy(true); setError('');
    try {
      const saved = await api.save(intent); if (!mounted.current) return; setWorkspace(saved); setDraft(saved.config); setBounds(boundsFor(saved.config)); setRecovery(null); setUncertain(false); setStorageBlocked(!api.persistenceAvailable()); setConflict(false); setNotice('Sepet ve ödeme önerileri uygulandı.'); finish();
    } catch (caught) {
      if (!mounted.current) return; const unresolved = api.hasUnresolved(); setUncertain(unresolved); setStorageBlocked(!api.persistenceAvailable()); if (unresolved) { try { setRecovery(api.pendingIntent()); } catch { /* The storage error remains visible. */ } } else setRecovery(null);
      if (caught instanceof OrderBumpsApiError && caught.code === 'version_conflict') setConflict(true);
      setError(caught instanceof Error ? caught.message : 'Ayarlar uygulanamadı. Girişleriniz korunuyor.');
    } finally { writing.current = false; if (mounted.current) setBusy(false); }
  }
  function label(kind: OrderBumpOptionKind, id: string) { return choices[keyOf(kind, id)]?.label ?? (kind === 'variant' ? 'Seçilen seçenek' : kind === 'category' ? 'Seçilen kategori' : 'Seçilen ürün'); }
  function references(kind: OrderBumpOptionKind, ids: readonly string[], rule: OrderBumpRule) {
    return ids.length ? <ul className={styles.selections}>{ids.map((id, index) => { const item = choices[keyOf(kind, id)]; return <li key={id}><span><strong>{label(kind, id)}</strong>{item?.available === false ? <small>Artık kullanılamıyor · seçimi kontrol edin</small> : kind === 'variant' && item ? <small>{price(item.priceCents)}</small> : null}</span><div>{kind === 'variant' ? <><button className={styles.iconButton} type="button" aria-label={label(kind, id) + ' yukarı taşı'} disabled={locked || index === 0} onClick={() => changeRule(rule.id, { variantIds: moved(ids, index, -1) })}><ArrowUp size={16} aria-hidden="true" /></button><button className={styles.iconButton} type="button" aria-label={label(kind, id) + ' aşağı taşı'} disabled={locked || index === ids.length - 1} onClick={() => changeRule(rule.id, { variantIds: moved(ids, index, 1) })}><ArrowDown size={16} aria-hidden="true" /></button></> : null}<button className={styles.iconButton} type="button" disabled={locked} aria-label={label(kind, id) + ' seçimini kaldır'} onClick={() => changeRule(rule.id, { [kind === 'product' ? 'productIds' : kind === 'category' ? 'categoryIds' : 'variantIds']: ids.filter(value => value !== id) })}><X size={16} aria-hidden="true" /></button></div></li>; })}</ul> : <p className={styles.help}>{kind === 'variant' ? 'En az bir ürün seçeneği ekleyin.' : 'Bu grup için koşul yok'}</p>;
  }
  const preview = draft.rules.filter(rule => rule.enabled).flatMap(rule => rule.variantIds.map(id => choices[keyOf('variant', id)])).filter((item): item is OrderBumpOption => !!item && item.available).filter((item, index, all) => all.findIndex(other => other.productId === item.productId) === index).slice(0, draft.maxOffers);
  return <>
    {!open ? <article className={shared.toolRow}><OrderBumpArtwork /><div className={shared.toolCopy}><h2>Sepet ve ödeme önerileri</h2><p>Tamamlayıcı ürünleri kendi kurallarınızla gösterin.</p>{phase === 'loading' ? <span role="status">Yükleniyor…</span> : phase === 'error' ? <span role="alert">Öneri ayarları yüklenemedi.</span> : <span>{workspace?.config.enabled ? 'Açık' : 'Kapalı'} · {workspace?.config.rules.length ?? 0} kural{!canManage ? ' · Salt okunur' : ''}</span>}{notice ? <p role="status">{notice}</p> : null}{uncertain ? <p role="status">Önceki kayıt sonucu doğrulanmalı. Girişleriniz korunuyor.</p> : null}{error ? <p role="alert">{error}</p> : null}</div>{phase === 'error' && !recovery ? <button type="button" className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Yeniden dene</button> : phase === 'ready' || recovery ? <button ref={trigger} type="button" className="button button-primary" data-tool-edit="order_bumps" onClick={begin}>{recovery && canManage ? 'Önceki kaydı doğrula' : canManage ? 'Düzenle' : 'Görüntüle'}<ArrowUpRight size={16} aria-hidden="true" /></button> : null}</article> : null}
    <DesignSettingsModal open={open} surface={{ label: 'Sepet ve ödeme önerileri', hint: 'Gösterim yerlerini ve sıralı öneri kurallarını düzenleyin.' }} returnFocusRef={trigger} onClose={requestClose} onApply={() => void apply()} applying={busy} applyDisabled={!canManage || (storageBlocked && !recovery) || conflict || reloading || !!decision || (!recovery && !!workspace && workspace.version > 0 && !dirty)} closeDisabled={busy || reloading || uncertain} applyLabel={uncertain ? 'Kaydı doğrula' : 'Uygula'} className={styles.modal}>
      <form ref={editor} className={styles.editor} data-settings-dirty={dirty || uncertain} onSubmit={event => { event.preventDefault(); void apply(); }}>
        {!canManage ? <p className={styles.feedback}><Info size={18} aria-hidden="true" />Salt okunur · Ayarları inceleyebilirsiniz.</p> : null}
        {storageBlocked ? <p className={styles.feedback}><Info size={18} aria-hidden="true" />Tarayıcı depolaması kullanılamıyor. Ayarları inceleyebilirsiniz; yeni kayıt için depolama iznini kontrol edin.</p> : null}
        {error ? <div className={styles.feedback} role="alert"><Info size={18} aria-hidden="true" /><div><p>{error}</p>{conflict ? <button type="button" className="button button-secondary" disabled={busy || reloading} onClick={() => setDecision('reload')}>Güncel ayarları yükle</button> : null}</div></div> : null}
        {uncertain ? <p className={styles.feedback} role="status">Aynı kayıt doğrulanana kadar girişler korunur.</p> : null}
        {decision ? <section className={styles.decision} data-order-bump-discard role="alert"><h3>{decision === 'reload' ? 'Girişleri bırakalım mı?' : 'Değişiklikler kaydedilmedi'}</h3><p>{decision === 'reload' ? 'Güncel ayarlar yüklenir. Yükleme başarısız olursa girişleriniz korunur.' : 'Bu ekrandaki kaydedilmeyen düzenlemeler kaldırılacak.'}</p><div><button type="button" className="button button-secondary" onClick={() => setDecision(null)}>Düzenlemeye devam</button><button type="button" className="button button-text" onClick={() => { if (decision === 'reload') void reload(); else { const next = destination; finish(); if (next) router.push(next); } }}>{decision === 'reload' ? 'Girişleri bırak ve yükle' : 'Değişiklikleri bırak'}</button></div></section> : null}
        <div className={styles.layout}><div className={styles.main}>
          <fieldset disabled={locked} className={styles.general}><legend className={styles.srOnly}>Gösterim</legend><label className={styles.toggle}><input disabled={locked} type="checkbox" role="switch" aria-label="Sepet ve ödeme önerileri açık" checked={draft.enabled} onChange={event => change({ ...draft, enabled: event.target.checked })} /><span>Öneriler {draft.enabled ? 'açık' : 'kapalı'}</span></label><label>Başlık<input {...fieldProps('heading')} disabled={locked} aria-label="Başlık" maxLength={120} value={draft.heading} onChange={event => change({ ...draft, heading: event.target.value })} />{fieldError('heading')}</label><div className={styles.two}><fieldset><legend>Gösterim yeri</legend><label className={styles.toggle}><input {...fieldProps('placements')} disabled={locked} type="checkbox" aria-label="Yan sepette göster" checked={draft.placements.sideCart} onChange={event => change({ ...draft, placements: { ...draft.placements, sideCart: event.target.checked } })} />Yan sepet</label><label className={styles.toggle}><input {...fieldProps('placements')} disabled={locked} type="checkbox" aria-label="Ödemede göster" checked={draft.placements.checkout} onChange={event => change({ ...draft, placements: { ...draft.placements, checkout: event.target.checked } })} />Ödeme</label>{fieldError('placements')}</fieldset><label>En fazla ürün<select disabled={locked} aria-label="En fazla ürün" value={draft.maxOffers} onChange={event => change({ ...draft, maxOffers: Number(event.target.value) as 1 | 2 | 3 })}>{[1, 2, 3].map(value => <option key={value} value={value}>{value} ürün</option>)}</select></label></div></fieldset>
          <section className={styles.rules}><header><div><h3>Kurallar</h3><small>{draft.rules.length}/20 · yukarıdaki önce uygulanır</small></div>{canManage ? <button type="button" className="button button-secondary" disabled={locked || draft.rules.length >= 20} onClick={addRule}><Plus size={16} aria-hidden="true" />Kural ekle</button> : null}</header>{draft.rules.length ? <ol className={styles.ruleList}>{draft.rules.map((rule, index) => <li key={rule.id} data-selected={activeRule === rule.id}><button type="button" className={styles.ruleName} aria-label={rule.name} aria-expanded={activeRule === rule.id} onClick={() => { setActiveRule(rule.id); setPicker(null); }}><span className={styles.order}>{index + 1}</span><span><strong data-rule-name>{rule.name}</strong><small>{rule.enabled ? 'Açık' : 'Kapalı'} · {rule.variantIds.length} seçenek</small></span></button><div className={styles.rowActions}><button type="button" className={styles.iconButton} aria-label={rule.name + ' yukarı taşı'} disabled={locked || index === 0} onClick={() => change({ ...draft, rules: moved(draft.rules, index, -1) })}><ArrowUp size={16} aria-hidden="true" /></button><button type="button" className={styles.iconButton} aria-label={rule.name + ' aşağı taşı'} disabled={locked || index === draft.rules.length - 1} onClick={() => change({ ...draft, rules: moved(draft.rules, index, 1) })}><ArrowDown size={16} aria-hidden="true" /></button><button type="button" className={styles.iconButton} aria-label={rule.name + ' kuralını kaldır'} disabled={locked} onClick={() => { change({ ...draft, rules: draft.rules.filter(item => item.id !== rule.id) }); setBounds(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== rule.id))); if (activeRule === rule.id) { setActiveRule(draft.rules.find(item => item.id !== rule.id)?.id ?? null); setPicker(null); } }}><Trash2 size={16} aria-hidden="true" /></button></div></li>)}</ol> : <div className={styles.empty}><ShoppingBag size={24} aria-hidden="true" /><p>Henüz öneri kuralı yok.</p>{canManage ? <span>Tamamlayıcı bir ürün seçmek için kural ekleyin.</span> : null}</div>}</section>
          {choiceError ? <div className={styles.feedback} role="alert"><div><p>{choiceError}</p><button type="button" className="button button-secondary" onClick={() => setHydrationRevision(value => value + 1)}>Seçili kayıtları yeniden yükle</button></div></div> : null}
          {selectedRule ? <section className={styles.ruleDetails} aria-label="Kural ayarları"><fieldset disabled={locked}><legend className={styles.srOnly}>Kural ayarları</legend><div className={styles.two}><label>Kural adı<input {...fieldProps(`${selectedRule.id}:name`)} disabled={locked} aria-label="Kural adı" maxLength={160} value={selectedRule.name} onChange={event => changeRule(selectedRule.id, { name: event.target.value })} />{fieldError(`${selectedRule.id}:name`)}</label><label className={styles.toggle}><input disabled={locked} type="checkbox" role="switch" aria-label="Bu kural açık" checked={selectedRule.enabled} onChange={event => changeRule(selectedRule.id, { enabled: event.target.checked })} />Kural {selectedRule.enabled ? 'açık' : 'kapalı'}</label></div></fieldset><div className={styles.group}><header><h4>Sepetteki ürünler</h4><button type="button" className="button button-text" disabled={locked || selectedRule.productIds.length >= 20} onClick={event => openPicker(event.currentTarget, selectedRule.id, 'product')}>Ürün koşulu ekle<Plus size={16} aria-hidden="true" /></button></header>{references('product', selectedRule.productIds, selectedRule)}</div><div className={styles.group}><header><h4>Sepetteki kategoriler</h4><button type="button" className="button button-text" disabled={locked || selectedRule.categoryIds.length >= 20} onClick={event => openPicker(event.currentTarget, selectedRule.id, 'category')}>Kategori koşulu ekle<Plus size={16} aria-hidden="true" /></button></header>{references('category', selectedRule.categoryIds, selectedRule)}<p className={styles.help}>Bir gruptaki seçimlerden biri eşleşir. Dolu gruplar birlikte uygulanır.</p></div><fieldset disabled={locked}><legend>Sepet tutarı</legend><div className={styles.two}>{(['min', 'max'] as const).map(bound => <label key={bound}>{bound === 'min' ? 'En az (₺)' : 'En çok (₺)'}<input {...fieldProps(`${selectedRule.id}:${bound}`)} disabled={locked} aria-label={bound === 'min' ? 'En az (₺)' : 'En çok (₺)'} inputMode="decimal" value={bounds[selectedRule.id]?.[bound] ?? ''} onChange={event => { if (locked || writing.current || reading.current) return; setBounds(current => ({ ...current, [selectedRule.id]: { ...(current[selectedRule.id] ?? { min: '', max: '' }), [bound]: event.target.value } })); setError(''); setValidation({}); }} />{fieldError(`${selectedRule.id}:${bound}`)}</label>)}</div><p className={styles.help}>İsteğe bağlı · indirim öncesi ürün ara toplamı.</p></fieldset><div className={styles.group}><header><h4>Önerilecek seçenekler</h4><button {...fieldProps(`${selectedRule.id}:variants`)} type="button" className="button button-text" disabled={locked || selectedRule.variantIds.length >= 6} onClick={event => openPicker(event.currentTarget, selectedRule.id, 'variant')}>Önerilecek seçenek ekle<Plus size={16} aria-hidden="true" /></button></header>{references('variant', selectedRule.variantIds, selectedRule)}{fieldError(`${selectedRule.id}:variants`)}<p className={styles.help}>En fazla 6 seçenek. Sepetteki veya stokta olmayan ürünler gösterilmez.</p></div>{picker?.ruleId === selectedRule.id ? <ReferencePicker key={picker.kind} api={api} kind={picker.kind} selectedIds={picker.kind === 'product' ? selectedRule.productIds : picker.kind === 'category' ? selectedRule.categoryIds : selectedRule.variantIds} limit={picker.kind === 'variant' ? 6 : 20} locked={locked} onOptions={remember} onSelect={id => { const field = picker.kind === 'product' ? 'productIds' : picker.kind === 'category' ? 'categoryIds' : 'variantIds', ids = selectedRule[field]; if (!ids.includes(id) && ids.length < (picker.kind === 'variant' ? 6 : 20)) changeRule(selectedRule.id, { [field]: [...ids, id] }); }} onClose={() => setPicker(null)} /> : null}</section> : null}
          <p className={styles.discount}>Ürünlere isteğe bağlı indirim <a href="/discounts">İndirimler</a> üzerinden tanımlanır. Mevcut indirimler normal ödeme akışında hesaplanır.</p>
        </div><aside className={styles.preview} aria-label="Öneri önizlemesi"><header><h3>Örnek görünüm</h3><small>{draft.enabled ? 'Uygun sepette gösterilir' : 'Öneriler kapalı'}</small></header><div className={styles.previewCart}><ShoppingBag size={20} aria-hidden="true" /><span>Sepetiniz</span></div><h4>{draft.heading || 'Başlık'}</h4>{preview.length ? preview.map(item => <div className={styles.previewProduct} key={item.id}><div className={styles.productArtwork}><ShoppingBag size={24} aria-hidden="true" /></div><div><strong>{item.label}</strong><span>{price(item.priceCents)}</span></div><span className={styles.previewAdd} aria-hidden="true"><Plus size={16} /></span></div>) : <p className={styles.help}>Seçtiğiniz ürün seçenekleri burada görünür.</p>}<p className={styles.help}>Kural sırası önceliklidir. Gerçek fiyat ve uygunluk sepette doğrulanır.</p></aside></div>
      </form>
    </DesignSettingsModal>
  </>;
}
