"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantAdminRecord, StoreAdminInvitationActionIntent, StoreAdminInvitationSendIntent } from "@celebix/saas-contracts";
import { merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import { invitationManagementClient } from "@/lib/store-admin-invitations/management-client";
import { deliveryLabel, invitationRows, type InvitationList } from "@/lib/store-admin-invitations/presentation";
import styles from "./invitations.module.css";
type Pending = { action: "send" | "resend" | "revoke"; intent: StoreAdminInvitationSendIntent | StoreAdminInvitationActionIntent };
export function StoreAdminInvitationsConsole({ canManage }: { canManage: boolean }) {
  const [records, setRecords] = useState<readonly MerchantAdminRecord[]>([]), [list, setList] = useState<InvitationList | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending | null>(null), active = useRef(false), pendingRef = useRef<Pending | null>(null), sequence = useRef(0);
  const load = useCallback(async () => {
    if (!canManage) return;
    const current = ++sequence.current; setLoading(true);
    const [sources, lifecycle] = await Promise.allSettled([merchantAdminApi.records("administrator_invite"), invitationManagementClient.list()]);
    if (sequence.current !== current) return;
    if (sources.status === "fulfilled") setRecords(sources.value); else setMessage("Kayıtlar yüklenemedi.");
    setList(lifecycle.status === "fulfilled" ? lifecycle.value : null); setLoading(false);
  }, [canManage]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  async function run(submission: Pending) {
    if (!canManage || active.current) return;
    active.current = true; pendingRef.current = submission; setPending(submission); setBusy(true); setMessage("");
    try {
      const result = await invitationManagementClient.mutate(submission.action, submission.intent);
      if (result.kind === "invitation_mutated") { pendingRef.current = null; setPending(null); setMessage(submission.action === "revoke" ? "Davet iptal edildi. Bu işlem mevcut üyeliği silmez." : "Davet işlemi kaydedildi. Teslimat durumu ayrıca izlenir."); await load(); }
      else if (result.kind === "invitation_management_rejected") {
        if (!result.retryable) { pendingRef.current = null; setPending(null); }
        setMessage(result.code === "version_conflict" ? "Kayıt değişti. Güncel bilgileri kontrol edip işlemi yeniden seçin." : result.code === "rate_limited" ? "Yeniden gönderim sınırı: dakikada bir, saatte beş. Daha sonra tekrar deneyin." : result.retryable ? "İşlem sonucu belirsiz. Aynı işlemi tekrar kontrol edin." : "Davet işlemi uygulanamadı. Yetki ve kayıt durumunu kontrol edin.");
        await load();
      }
    } catch { setMessage("İşlem sonucu belirsiz. Aynı işlemi tekrar kontrol edin."); }
    finally { active.current = false; setBusy(false); }
  }
  function choose(action: Pending["action"], row: ReturnType<typeof invitationRows>[number]) {
    if (pendingRef.current || active.current) return;
    const operationId = crypto.randomUUID();
    if (action === "send" && row.canSend) void run({ action, intent: { sourceRecordId: row.source.id, expectedRecordVersion: row.source.version, operationId } });
    else if (row.invitation && (action === "resend" ? row.canResend : action === "revoke" && row.canRevoke)) void run({ action, intent: { invitationId: row.invitation.id, expectedVersion: row.invitation.version, operationId } });
  }
  if (!canManage) return <section className={styles.workspace}><h1>Yönetici davetleri</h1><p role="alert">Yalnız mağaza sahibi yönetici davetlerini görüntüleyebilir ve yönetebilir.</p></section>;
  const rows = invitationRows(records, list, new Date());
  return <section className={styles.workspace}>
    <header><div><h1>Yönetici davetleri</h1><p>Kaydetmek e-posta göndermez. Gönderilecek kişiyi açıkça seçin.</p></div><div className={styles.actions}><a href="/settings/administrators/new">Yeni davet kaydı</a><button onClick={() => void load()} disabled={loading || busy}>Yenile</button></div></header>
    <p className={styles.note}>Davet kabulü, üyeliğin şu anda etkin olduğunu göstermez. E-posta sağlayıcısının kabulü, gelen kutusuna teslim edildiği anlamına gelmez. Yeniden gönderim: dakikada bir, saatte beş.</p>
    {message ? <p role="status">{message}</p> : null}
    {pending ? <button disabled={busy} onClick={() => void run(pending)}>{busy ? "İşleniyor…" : "Aynı işlemi tekrar kontrol et"}</button> : null}
    {loading ? <p role="status">Davetler yükleniyor…</p> : null}
    {!loading && list === null ? <p role="alert">Durum doğrulanamadı. Gönderim işlemleri kapalı.</p> : null}
    {list?.hasMore ? <p role="alert">Liste kısmi. Eşleşmeyen kayıtların gönderim durumu bilinmiyor.</p> : null}
    <div className={styles.tableScroll}><table aria-label="Yönetici davetleri"><thead><tr><th>Kişi ve rol</th><th>Davet durumu</th><th>E-posta durumu</th><th>İşlemler</th></tr></thead><tbody>{rows.map(row => <tr key={row.source.id}>
      <td><strong>{row.name}</strong><span>{row.email}</span><small>{row.role}</small></td><td>{row.label}</td><td>{deliveryLabel(row.invitation?.deliveryStatus ?? null)}</td>
      <td><div className={styles.actions}>{row.canEdit ? <a href={`/settings/administrators/${row.source.id}/edit`}>Düzenle</a> : row.invitation ? <span>Gönderilen kayıt değiştirilemez</span> : null}
        {row.canSend ? <button disabled={Boolean(pending) || busy || loading} onClick={() => choose("send", row)}>Gönder</button> : null}
        {row.canResend ? <button disabled={Boolean(pending) || busy || loading} onClick={() => choose("resend", row)}>Yeniden gönder</button> : null}
        {row.canRevoke ? <button disabled={Boolean(pending) || busy || loading} onClick={() => choose("revoke", row)}>Daveti iptal et</button> : null}</div></td>
    </tr>)}</tbody></table></div>
    {!loading && !records.length ? <p>Henüz davet kaydı yok.</p> : null}
  </section>;
}
