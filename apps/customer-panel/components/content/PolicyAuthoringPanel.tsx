'use client';

import { Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProductDescriptionPreview } from '@/components/catalog/ProductDescriptionPreview';
import { readToshiCredits, type ToshiWallet } from '@/lib/content-authoring-ui/credits-client';
import { POLICY_AUTHORING_CREDIT_COST, type PolicyAuthoringResult } from '@/lib/policy-authoring/types';
import { parsePolicyAuthoringRequest, parsePolicyAuthoringResult } from '@/lib/policy-authoring/validation';
import { PolicyAuthoringApiError, policyAuthoringClient } from '@/lib/policy-authoring-ui/client';
import { rebindPolicyAuthoringRecoveryContext, restorePolicyAuthoringPreviewContext, samePolicyAuthoringContext, type PolicyAuthoringContext } from '@/lib/policy-authoring-ui/controller';
import { clearPolicyAuthoringCompletedPreview, clearPolicyAuthoringRecovery, readPolicyAuthoringCompletedPreview, readPolicyAuthoringRecovery, writePolicyAuthoringCompletedPreview, writePolicyAuthoringRecovery, type PolicyAuthoringCompletedPreview, type PolicyAuthoringReceipt } from '@/lib/policy-authoring-ui/recovery';
import styles from './policy-authoring-panel.module.css';

type Props = Readonly<{
  context: PolicyAuthoringContext;
  disabled?: boolean;
  canApply?: boolean;
  applyUnavailableReason?: string;
  onApply(result: PolicyAuthoringResult, captured: PolicyAuthoringContext): boolean;
  onClose(): void;
}>;
const terminal = new Set(['operation_failed', 'version_conflict', 'invalid_output', 'source_too_large', 'insufficient_credits', 'invalid_input', 'unauthenticated', 'membership_denied', 'feature_not_enabled', 'feature_unavailable', 'store_inactive', 'origin_denied']);
function errorMessage(error: unknown): string {
  const code = error instanceof PolicyAuthoringApiError ? error.code : '';
  if (code === 'insufficient_credits' || code === 'budget_exceeded' || code === 'quota_exceeded') return 'Yeterli Toshi krediniz yok.';
  if (code === 'version_conflict') return 'Politika başka bir oturumda değişti. Güncel sürümü alıp yeniden hazırlayın.';
  if (code === 'source_too_large') return 'Bu metin Toshi ile tek seferde düzenlenemeyecek kadar uzun. Metniniz korundu.';
  if (code === 'operation_failed' || code === 'invalid_output') return 'Metin hazırlanamadı. Mevcut metniniz korundu.';
  if (terminal.has(code)) return 'İşlem başlatılamadı. Mevcut metniniz korundu.';
  return 'İşlem sonucu doğrulanamadı. Metniniz korundu; aynı işlemin sonucunu kontrol edin.';
}

export function PolicyAuthoringPanel({ context, disabled = false, canApply = true, applyUnavailableReason = 'Düzenleyici henüz hazır değil.', onApply, onClose }: Props) {
  const [initial] = useState(() => {
    let preview: PolicyAuthoringCompletedPreview | null = null, receipt: PolicyAuthoringReceipt | null = null, error = '';
    try {
      const saved = readPolicyAuthoringCompletedPreview(window.sessionStorage, context.recoveryScope, context.policyKey);
      if (saved) preview = { ...saved, receipt: { ...saved.receipt, context: restorePolicyAuthoringPreviewContext(saved.receipt.context, context) } };
    } catch { error = 'Önizleme kaydı okunamadı. Yeni üretim başlatılamaz.'; }
    try { receipt = readPolicyAuthoringRecovery(window.sessionStorage, context.recoveryScope, context.policyKey); }
    catch { error = 'İşlem kurtarma kaydı okunamadı. Yeni üretim başlatılamaz.'; }
    if (receipt?.operationId === preview?.result.operationId) receipt = null;
    return { preview, receipt, error };
  });
  const [receipt, setReceipt] = useState<PolicyAuthoringReceipt | null>(initial.receipt);
  const [busy, setBusy] = useState(false), [error, setError] = useState(initial.error);
  const [wallet, setWallet] = useState<ToshiWallet | null>(null);
  const [oversizedBody, setOversizedBody] = useState<string | null>(null);
  const [preview, setPreview] = useState<PolicyAuthoringCompletedPreview | null>(initial.preview);
  const [storageBlocked, setStorageBlocked] = useState(Boolean(initial.error));
  const current = useRef(context), active = useRef(true), locked = useRef(false), firstAction = useRef<HTMLButtonElement>(null);
  current.current = context;
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void readToshiCredits(controller.signal).then(overview => { if (active.current) setWallet(overview.wallet); }).catch(() => undefined);
    firstAction.current?.focus();
    return () => { active.current = false; controller.abort(); };
  }, []);

  async function dispatch(savedOperation: PolicyAuthoringReceipt, recovering = false) {
    if (locked.current || disabled) return;
    locked.current = true; setBusy(true); setError('');
    let operation = savedOperation;
    try {
      if (recovering) {
        const rebound = rebindPolicyAuthoringRecoveryContext(operation.context, current.current);
        if (rebound !== operation.context) {
          operation = { ...operation, context: rebound };
          writePolicyAuthoringRecovery(window.sessionStorage, operation);
          setReceipt(operation);
        }
      }
      const result = parsePolicyAuthoringResult(await policyAuthoringClient.generate(operation.request, operation.operationId), { request: operation.request, operationId: operation.operationId });
      if (!active.current) return;
      const completed = { receipt: operation, result };
      setWallet(result.wallet); setPreview(completed);
      try {
        writePolicyAuthoringCompletedPreview(window.sessionStorage, completed);
        clearPolicyAuthoringRecovery(window.sessionStorage, operation);
        setReceipt(null); setStorageBlocked(false);
      } catch {
        setStorageBlocked(true);
        setError('Metin hazır; önizleme kaydı saklanamadı. Sonucu kaybetmemek için aynı işlemin sonucunu kontrol edin.');
      }
    } catch (caught) {
      if (!active.current) return;
      if (caught instanceof PolicyAuthoringApiError && terminal.has(caught.code)) {
        try { clearPolicyAuthoringRecovery(window.sessionStorage, operation); setReceipt(null); }
        catch { setError('İşlem kaydı temizlenemedi. Yeni üretim başlatılamaz.'); return; }
      }
      if (caught instanceof PolicyAuthoringApiError && caught.code === 'source_too_large') setOversizedBody(operation.request.currentBody);
      setError(errorMessage(caught));
    } finally { locked.current = false; if (active.current) setBusy(false); }
  }
  function generate() {
    if (locked.current || receipt || disabled || storageBlocked || oversizedBody === current.current.body) return;
    try {
      const captured = current.current;
      const request = parsePolicyAuthoringRequest({ kind: 'policy', draftId: crypto.randomUUID(), policyKey: captured.policyKey, policyVersion: captured.policyVersion, currentBody: captured.body, locale: 'tr' });
      const operation = { operationId: crypto.randomUUID(), request, context: captured };
      writePolicyAuthoringRecovery(window.sessionStorage, operation);
      setReceipt(operation); void dispatch(operation);
    } catch { setError('İşlem kimliği güvenle saklanamadı. Yeni üretim başlatılamaz.'); }
  }
  function clearPreview(prepared: PolicyAuthoringCompletedPreview) {
    clearPolicyAuthoringCompletedPreview(window.sessionStorage, prepared);
    const pending = readPolicyAuthoringRecovery(window.sessionStorage, prepared.receipt.context.recoveryScope, prepared.receipt.context.policyKey);
    if (pending?.operationId === prepared.result.operationId) {
      clearPolicyAuthoringRecovery(window.sessionStorage, pending);
      setReceipt(currentReceipt => currentReceipt?.operationId === pending.operationId ? null : currentReceipt);
    }
    setStorageBlocked(false);
  }
  function applyPreview() {
    if (!preview || !canApply || disabled || busy || !samePolicyAuthoringContext(current.current, preview.receipt.context)
      || !onApply(preview.result, preview.receipt.context)) { setError('Önizleme artık güncel değil. Metniniz korundu.'); return; }
    try { clearPreview(preview); }
    catch { setStorageBlocked(true); setError('Metin uygulandı; önizleme kaydı temizlenemedi. Yeni üretim başlatılamaz.'); return; }
    setPreview(null); onClose();
  }
  function discardPreview() {
    if (!preview || busy) return;
    try { clearPreview(preview); setPreview(null); setError(''); }
    catch { setStorageBlocked(true); setError('Önizleme kaydı temizlenemedi. Metniniz korundu.'); }
  }
  const stale = !!preview && !samePolicyAuthoringContext(context, preview.receipt.context);
  const insufficient = wallet !== null && wallet.available < POLICY_AUTHORING_CREDIT_COST;
  return <section className={styles.panel} aria-label="Toshi ile politika" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className={styles.heading}><div className={styles.identity}><Sparkles aria-hidden="true" /><strong>Toshi</strong></div><span className={styles.wallet}>{wallet ? <><strong>{wallet.available.toLocaleString('tr-TR')}</strong> kredi</> : 'Kredi bakiyesi'}</span><button type="button" className={styles.closeButton} onClick={onClose} aria-label="Toshi panelini kapat"><X aria-hidden="true" /></button></div>
    <p>Hazırlanan metni inceleyip Metne uygula düğmesiyle düzenleyiciye aktarın. Ardından Kaydet düğmesini kullanın.</p>
    <div className={styles.prepareRow}>{receipt ? <button ref={preview ? undefined : firstAction} type="button" disabled={busy || disabled} onClick={() => void dispatch(receipt, true)}>{busy ? 'Hazırlanıyor…' : 'İşlemin sonucunu kontrol et'}</button> : <button ref={preview ? undefined : firstAction} type="button" className={preview ? undefined : styles.prepareButton} disabled={busy || disabled || storageBlocked || insufficient || oversizedBody === context.body} onClick={generate}>{busy ? 'Hazırlanıyor…' : preview ? 'Yeniden hazırla' : 'Metni hazırla'}</button>}<small>{POLICY_AUTHORING_CREDIT_COST} kredi</small></div>
    {receipt && !busy ? <p role="status">Yeni üretim başlatmadan önce aynı işlemin sonucunu kontrol edin.</p> : null}
    {insufficient && !receipt && !preview ? <p role="alert">Yeterli Toshi krediniz yok. <a href="/settings/artificial-intelligence">Kredi yükle</a></p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {preview ? <div className={styles.previews}><div className={styles.previewHeading}><h3>Önizleme</h3><div className={styles.previewActions}><button type="button" disabled={busy} onClick={discardPreview}>Önizlemeyi kaldır</button><button ref={firstAction} type="button" className={styles.applyButton} disabled={stale || disabled || busy || !canApply} onClick={applyPreview}>Metne uygula</button></div></div><p role="status">Metin hazır. Kaydetmek için önce Metne uygula düğmesini kullanın.</p>{stale ? <p role="status">Metin veya görünürlük değişti. Güncel bilgilerle yeniden hazırlayın.</p> : null}{!canApply ? <p role="status">{applyUnavailableReason}</p> : null}<div className={styles.preview}><ProductDescriptionPreview source={preview.result.body} /></div>{preview.result.suggestions.length ? <details><summary>İnceleme notları</summary><ul>{preview.result.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul></details> : null}</div> : null}
  </section>;
}
