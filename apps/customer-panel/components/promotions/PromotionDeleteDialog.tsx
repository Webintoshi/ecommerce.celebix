"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PromotionDeletionEnvelope, PromotionDeletionImpact } from "@celebix/saas-contracts";
import { DesignSettingsModal } from "@/components/settings/design/DesignSettingsDrawer";
import { promotionErrorMessage, type PromotionApiClient } from "@/lib/promotion-ui/client";

type Props = Readonly<{
  id: string; name: string;
  api: Pick<PromotionApiClient, "deletionImpact" | "delete" | "pendingDeletion">;
  returnFocusRef: RefObject<HTMLElement | null>;
  onDeleted: (receipt: PromotionDeletionEnvelope) => void; onCancel: () => void;
  onMutationChanged?: (busy: boolean) => void;
}>;

export function PromotionDeleteDialog({ id, name, api, returnFocusRef, onDeleted, onCancel, onMutationChanged }: Props) {
  const pending = useRef(api.pendingDeletion(id));
  const expectedVersion = useRef<number | null>(pending.current);
  const inFlight = useRef(false);
  const [impact, setImpact] = useState<PromotionDeletionImpact | null>(null);
  const [loading, setLoading] = useState(pending.current === null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(pending.current !== null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (expectedVersion.current !== null && uncertain) return;
    const controller = new AbortController(); setLoading(true); setImpact(null);
    void api.deletionImpact(id, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      expectedVersion.current = value.version; setImpact(value);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(promotionErrorMessage(reason instanceof Error ? reason.message : "promotion_unavailable"));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, api, retry, uncertain]);
  const close = useCallback(() => { if (!inFlight.current) onCancel(); }, [onCancel]);
  const apply = async () => {
    if (inFlight.current || expectedVersion.current === null || (!uncertain && !impact?.canDelete)) return;
    inFlight.current = true; setBusy(true); setError(""); onMutationChanged?.(true);
    try { const receipt = await api.delete(id, expectedVersion.current); setUncertain(false); onDeleted(receipt); }
    catch (reason) {
      const unresolved = api.pendingDeletion(id) !== null;
      setUncertain(unresolved);
      setError(unresolved ? "Silme işleminin sonucu doğrulanamadı. Aynı işlemi tekrar deneyin." : promotionErrorMessage(reason instanceof Error ? reason.message : "promotion_unavailable"));
      if (!unresolved) setRetry(value => value + 1);
    } finally { inFlight.current = false; setBusy(false); onMutationChanged?.(false); }
  };
  return <DesignSettingsModal open surface={{ label: "İndirimi sil", hint: "Kalıcı silme onayı" }} onClose={close} onApply={() => void apply()} applying={busy} applyDisabled={loading || (!uncertain && !impact?.canDelete)} applyLabel={uncertain ? "Silmeyi doğrula" : "Sil"} applyingLabel="Siliniyor…" returnFocusRef={returnFocusRef}>
    <p><strong>{impact?.name ?? name}</strong> kalıcı olarak silinsin mi?</p>
    <p>İndirim ve kuponları kullanılamaz. Geçmiş sipariş ve iade kayıtları korunur.</p>
    {loading ? <p role="status">Bağlantılar kontrol ediliyor…</p> : null}
    {impact?.preservedRedemptionCount ? <p>{impact.preservedRedemptionCount} geçmiş kullanım kaydı korunacak.</p> : null}
    {impact && impact.pendingReservationCount > 0 ? <p role="alert">{impact.pendingReservationCount} devam eden ödeme var. Sonuçlandıktan sonra silebilirsiniz.</p> : null}
    {impact?.linkedTools.some(tool => tool.enabled) ? <div role="alert"><p>Önce bu araçların indirim bağlantısını kaldırın veya araçları kapatın:</p><ul>{impact.linkedTools.filter(tool => tool.enabled).map(tool => <li key={tool.id}>{tool.name}</li>)}</ul></div> : null}
    {error ? <p role="alert">{error}</p> : uncertain ? <p role="status">Önceki silme işleminin sonucunu doğrulayın.</p> : null}
    {!uncertain && !loading && (!impact || !impact.canDelete) ? <button type="button" className="button button-text" onClick={() => { setError(""); setRetry(value => value + 1); }}>Tekrar kontrol et</button> : null}
  </DesignSettingsModal>;
}
