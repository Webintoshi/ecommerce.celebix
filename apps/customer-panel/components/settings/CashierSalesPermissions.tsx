'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { InStoreStaffGrant } from '@celebix/saas-contracts';
import { inStoreSalesUi, InStoreSalesUiError, type InStoreSalesUiClient } from '../../lib/in-store-sales-ui/client.ts';
import { parseMinorUnits } from '../../lib/in-store-sales-ui/model.ts';
import type { MerchantStaff } from '../../lib/merchant-staff-ui/model.ts';
import { OrderActionDialog } from '../orders/OrderActionDialog';
import styles from './CashierSalesPermissions.module.css';

export type CashierSalesPermissionsClient = Pick<InStoreSalesUiClient, 'bootstrap' | 'listStaff' | 'setStaffGrant' | 'newId'>;
type GrantInput = Parameters<InStoreSalesUiClient['setStaffGrant']>[1];
type Snapshot = Readonly<{
  client: CashierSalesPermissionsClient;
  membershipId: string;
  bootstrap: Awaited<ReturnType<InStoreSalesUiClient['bootstrap']>>;
  grant: InStoreStaffGrant;
}>;
type Draft = Readonly<{
  enabled: boolean;
  locationIds: readonly string[];
  discount: string;
  canEditPrice: boolean;
  canSellOnCredit: boolean;
  canCollectReceivables: boolean;
  canManageAccounting: boolean;
  canManageOrders: boolean;
  commissionEnabled: boolean;
  commissionRate: string;
}>;
const percent = (bps: number) => String(bps / 100).replace('.', ',');
function draftFor(grant: InStoreStaffGrant): Draft {
  return { enabled: grant.enabled, locationIds: grant.locationIds, discount: percent(grant.discountLimitBps), canEditPrice: grant.canEditPrice === true, canSellOnCredit: grant.canSellOnCredit === true, canCollectReceivables: grant.version === 0 || grant.canCollectReceivables === true, canManageAccounting: grant.canManageAccounting === true, canManageOrders: grant.canManageOrders === true, commissionEnabled: grant.commissionEnabled === true, commissionRate: percent(grant.commissionRateBps ?? 0) };
}
async function readSnapshot(client: CashierSalesPermissionsClient, membershipId: string): Promise<Snapshot> {
  const [bootstrap, grants] = await Promise.all([client.bootstrap(), client.listStaff()]);
  const matches = grants.filter(row => row.membershipId === membershipId);
  if (!bootstrap.permissions.canManageStaff || matches.length !== 1 || matches[0].role !== 'cashier') throw new InStoreSalesUiError('membership_denied', 403);
  return { client, membershipId, bootstrap, grant: matches[0] };
}
function readError(error: unknown): string {
  if (error instanceof InStoreSalesUiError && error.code === 'unauthenticated') return 'Oturumun sona erdi. Yeniden giriş yap.';
  if (error instanceof InStoreSalesUiError && error.code === 'membership_denied') return 'Bu personelin kasiyer yetkileri düzenlenemiyor. Güncel personel kaydını ve erişimini kontrol edin.';
  return 'Satış yetkileri yüklenemedi. Yeniden deneyin.';
}

/** Personnel edits the existing server grant; opening this dialog never creates one. */
export function CashierSalesPermissions({ membershipId, staff, active, client = inStoreSalesUi, onClose, onSaved }: Readonly<{
  membershipId: string;
  staff?: MerchantStaff;
  active: boolean;
  client?: CashierSalesPermissionsClient;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [fresh, setFresh] = useState<Snapshot | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const mounted = useRef(false), pending = useRef(false), reading = useRef(false);
  const initial = useRef<{ client: CashierSalesPermissionsClient; membershipId: string; promise: Promise<Snapshot> } | null>(null);
  const operation = useRef<{ fingerprint: string; membershipId: string; input: GrantInput; key: string } | null>(null);
  const formId = useId(), errorId = useId();
  const targetActive = active && staff?.membershipId === membershipId && staff.enabled && staff.role === 'cashier';
  const ready = snapshot?.client === client && snapshot.membershipId === membershipId && draft !== null;

  useEffect(() => {
    let current = true;
    mounted.current = true;
    if (initial.current?.client !== client || initial.current.membershipId !== membershipId) initial.current = { client, membershipId, promise: readSnapshot(client, membershipId) };
    void initial.current.promise.then(value => {
      if (!current) return;
      setSnapshot(value); setDraft(draftFor(value.grant)); setError(null); setLoading(false);
    }).catch(reason => { if (current) { setError(readError(reason)); setLoading(false); } });
    return () => { current = false; mounted.current = false; };
  }, [client, membershipId]);

  async function reload() {
    if (pending.current || reading.current || uncertain || !targetActive) return;
    reading.current = true; setLoading(true); if (conflict) setFresh(null);
    try {
      const value = await readSnapshot(client, membershipId);
      if (!mounted.current) return;
      if (conflict) { setFresh(value); setError('Güncel yetkiler yüklendi. Taslağınız korunuyor; kaydetmeden önce güncel kaydı kontrol edip sürümünü kullanın.'); }
      else { setSnapshot(value); setDraft(draftFor(value.grant)); setError(null); }
    } catch (reason) { if (mounted.current) setError(readError(reason)); }
    finally { reading.current = false; if (mounted.current) setLoading(false); }
  }
  function adoptVersion() {
    if (!fresh || !targetActive || pending.current || reading.current) return;
    setSnapshot(fresh); setFresh(null); setConflict(false); setError(null); operation.current = null;
  }
  function close() { if (!pending.current) onClose(); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetActive || !ready || !snapshot || !draft || pending.current || reading.current || conflict) return;
    let request = operation.current;
    if (!uncertain) {
      const discountLimitBps = parseMinorUnits(draft.discount);
      if (discountLimitBps === null || discountLimitBps > 9999) { setError('İndirim sınırı %0 ile %99,99 arasında olmalı.'); return; }
      if (draft.enabled && draft.locationIds.length === 0) { setError('Manuel satışı etkinleştirmek için en az bir satış deposu seçin.'); return; }
      const enteredCommissionRate = parseMinorUnits(draft.commissionRate.trim() || '0');
      const commissionRateBps = !draft.commissionEnabled && (enteredCommissionRate === null || enteredCommissionRate > 10000) ? snapshot.grant.commissionRateBps ?? 0 : enteredCommissionRate;
      if (commissionRateBps === null || commissionRateBps > 10000 || (draft.commissionEnabled && commissionRateBps < 1)) { setError('Prim oranı %0,01 ile %100 arasında olmalı.'); return; }
      const input: GrantInput = { expectedVersion: snapshot.grant.version, enabled: draft.enabled, locationIds: draft.locationIds, discountLimitBps, canEditPrice: draft.canEditPrice, canSellOnCredit: draft.canSellOnCredit, canCollectReceivables: draft.canCollectReceivables, canManageAccounting: draft.canManageAccounting, canManageOrders: draft.canManageOrders, commissionEnabled: draft.commissionEnabled, commissionRateBps };
      const fingerprint = JSON.stringify([membershipId, input]);
      if (request?.fingerprint !== fingerprint) {
        try { request = { fingerprint, membershipId, input, key: client.newId() }; }
        catch { setError('İşlem başlatılamadı. Yeniden deneyin.'); return; }
        operation.current = request;
      }
    }
    if (!request || request.membershipId !== membershipId) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      const updated = await client.setStaffGrant(request.membershipId, request.input, request.key);
      if (updated.membershipId !== membershipId || updated.role !== 'cashier') throw new InStoreSalesUiError('unavailable', 503, true);
      if (mounted.current) { operation.current = null; setUncertain(false); onSaved(); }
    } catch (reason) {
      if (!mounted.current) return;
      if (!(reason instanceof InStoreSalesUiError) || reason.unknownResult) {
        setUncertain(true); setError('Sonuç doğrulanamadı. Bilgileriniz korunuyor. Kaydı aynı işlemle yeniden deneyerek sonucu doğrulayın.');
      } else {
        setUncertain(false);
        if (reason.code === 'version_conflict') { setConflict(true); setFresh(null); setError('Satış yetkileri başka bir işlemle değişti. Güncel yetkileri yükleyin ve kaydetmeden önce kontrol edin.'); }
        else if (reason.code === 'membership_denied' || reason.code === 'not_found') setError('Bu personelin satış yetkileri kaydedilemedi. Güncel personel kaydını ve erişimini kontrol edin.');
        else if (reason.code === 'unauthenticated') setError('Oturumun sona erdi. Yeniden giriş yap.');
        else setError('Satış yetkileri kaydedilemedi. Bilgilerinizi kontrol edip yeniden deneyin.');
      }
    } finally { pending.current = false; if (mounted.current) setSaving(false); }
  }

  const locked = saving || loading || uncertain || !targetActive;
  const locations = ready ? snapshot.bootstrap.locations : [];
  const unavailableLocations = draft?.locationIds.filter(id => !locations.some(location => location.id === id)) ?? [];
  return <OrderActionDialog open title="Satış yetkileri" onClose={close} busy={saving}>
    <div className={styles.content}>
      <p className={styles.intro}><strong>{staff?.displayName ?? 'Personel'}</strong> için mağaza içi satış ve tahsilat yetkilerini düzenleyin.</p>
      <p className={styles.note}>Kasiyer analizleri görüntüleyebilir; ürün ekleyebilir, düzenleyebilir ve silebilir. Bu erişimler kasiyer rolüyle birlikte gelir.</p>
      {!targetActive ? <p className={styles.error} role="alert">Bu personelin etkin kasiyer erişimi bulunmuyor. Personel listesini yenileyin.</p> : <>
        {error ? <p id={errorId} className={styles.error} role="alert">{error}</p> : null}
        {!ready ? loading ? <div className={styles.loading} role="status" aria-label="Satış yetkileri yükleniyor"><span>Satış yetkileri yükleniyor…</span><div aria-hidden="true"/><div aria-hidden="true"/><div aria-hidden="true"/></div> : <button type="button" className={styles.secondary} onClick={() => void reload()}>Yeniden dene</button> : <form id={formId} data-cashier-sales-form className={styles.form} onSubmit={event => void save(event)} aria-describedby={error ? errorId : undefined}>
          <fieldset className={styles.group} disabled={locked}>
            <legend>Satış erişimi</legend>
            <label className={styles.check}><input type="checkbox" name="canManageOrders" checked={draft.canManageOrders} onChange={event => setDraft({ ...draft, canManageOrders: event.target.checked })}/><span>Siparişlere erişebilir</span></label>
            <label className={styles.check}><input type="checkbox" name="enabled" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })}/><span>Manuel satış etkin</span></label>
          </fieldset>
          <fieldset className={styles.group} disabled={locked}>
            <legend>Satış depoları</legend>
            <p className={styles.helper}>Kasiyerin satış yapabileceği depoları seçin.</p>
            {locations.length ? locations.map(location => <label className={styles.check} key={location.id}><input type="checkbox" name="location" value={location.id} checked={draft.locationIds.includes(location.id)} onChange={event => setDraft({ ...draft, locationIds: event.target.checked ? [...draft.locationIds, location.id] : draft.locationIds.filter(id => id !== location.id) })}/><span>{location.name}</span></label>) : <p className={styles.helper}>Kullanılabilir satış deposu bulunmuyor.</p>}
            {unavailableLocations.map((id, index) => <label className={styles.check} key={id}><input type="checkbox" name="location" value={id} checked onChange={() => setDraft({ ...draft, locationIds: draft.locationIds.filter(value => value !== id) })}/><span>Artık listelenmeyen atanmış depo {index + 1}</span></label>)}
          </fieldset>
          <fieldset className={styles.group} disabled={locked}>
            <legend>İndirim ve ödeme</legend>
            <label className={styles.field}><span>En yüksek indirim (%)</span><input name="discount" inputMode="decimal" autoComplete="off" maxLength={5} value={draft.discount} onChange={event => setDraft({ ...draft, discount: event.target.value })}/><small>%0 ile %99,99 arasında bir değer girin.</small></label>
            <label className={styles.check}><input type="checkbox" name="canEditPrice" checked={draft.canEditPrice} onChange={event => setDraft({ ...draft, canEditPrice: event.target.checked })}/><span>Fiyat düzenleyebilir</span></label>
            <label className={styles.check}><input type="checkbox" name="canSellOnCredit" checked={draft.canSellOnCredit} onChange={event => setDraft({ ...draft, canSellOnCredit: event.target.checked })}/><span>Veresiye satış yapabilir</span></label>
            <label className={styles.check}><input type="checkbox" name="canCollectReceivables" checked={draft.canCollectReceivables} onChange={event => setDraft({ ...draft, canCollectReceivables: event.target.checked })}/><span>Müşteri borcu tahsil edebilir</span></label>
            <label className={styles.check}><input type="checkbox" name="canManageAccounting" checked={draft.canManageAccounting} onChange={event => setDraft({ ...draft, canManageAccounting: event.target.checked })}/><span>Tüm muhasebeye erişebilir</span></label>
          </fieldset>
          <fieldset className={styles.group} disabled={locked}>
            <legend>Prim</legend>
            <label className={styles.check}><input type="checkbox" name="commissionEnabled" checked={draft.commissionEnabled} onChange={event => setDraft({ ...draft, commissionEnabled: event.target.checked })}/><span>Prim aktif</span></label>
            <label className={styles.field}><span>Prim oranı (%)</span><input name="commissionRate" inputMode="decimal" autoComplete="off" maxLength={6} value={draft.commissionRate} required={draft.commissionEnabled} disabled={!draft.commissionEnabled} onChange={event => setDraft({ ...draft, commissionRate: event.target.value })}/><small>İndirim, iade ve iskonto sonrası ürün tutarı üzerinden. Kargo dahil edilmez. Oran değişikliği sonraki satışlara uygulanır.</small></label>
          </fieldset>
          {conflict ? <div className={styles.conflict}>
            {fresh ? <div className={styles.note}><strong>Güncel kayıt</strong><p>Manuel satış {fresh.grant.enabled ? 'etkin' : 'kapalı'} · İndirim %{percent(fresh.grant.discountLimitBps)}</p><p>Depolar: {fresh.grant.locationIds.map(id => fresh.bootstrap.locations.find(location => location.id === id)?.name ?? 'Listelenmeyen depo').join(', ') || 'Atanmamış'}</p><p>Fiyat düzenleme: {fresh.grant.canEditPrice ? 'Açık' : 'Kapalı'} · Veresiye: {fresh.grant.canSellOnCredit ? 'Açık' : 'Kapalı'} · Tahsilat: {fresh.grant.canCollectReceivables ? 'Açık' : 'Kapalı'} · Siparişler: {fresh.grant.canManageOrders ? 'Açık' : 'Kapalı'} · Tüm muhasebe: {fresh.grant.canManageAccounting ? 'Açık' : 'Kapalı'}</p><p>Prim: {fresh.grant.commissionEnabled ? 'Aktif' : 'Kapalı'} · %{percent(fresh.grant.commissionRateBps ?? 0)}</p></div> : null}
            <div className={styles.actions}><button type="button" className={styles.secondary} disabled={saving || loading} onClick={() => void reload()}>{loading ? 'Yükleniyor…' : 'Güncel yetkileri yükle'}</button><button type="button" className={styles.secondary} disabled={saving || loading || !fresh} onClick={adoptVersion}>Güncel sürümü kullan</button></div>
          </div> : null}
          <footer className={styles.actions}><button type="button" className={styles.secondary} disabled={saving} onClick={close}>Vazgeç</button><button type="submit" className={styles.primary} disabled={saving || loading || conflict}>{saving ? 'Kaydediliyor…' : uncertain ? 'Aynı işlemi yeniden dene' : 'Kaydet'}</button></footer>
        </form>}
      </>}
    </div>
  </OrderActionDialog>;
}
