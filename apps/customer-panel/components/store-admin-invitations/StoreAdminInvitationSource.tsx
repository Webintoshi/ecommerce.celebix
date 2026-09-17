"use client";
import { useEffect, useState } from "react";
import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { invitationManagementClient } from "@/lib/store-admin-invitations/management-client";
import { merchantAdminApi } from "@/lib/merchant-admin-ui/client";
async function recoverInvitationSource(recordId: string) {
  const [list, current] = await Promise.all([invitationManagementClient.list(), merchantAdminApi.record("administrator_invite", recordId)]);
  if (list.items.some(item => item.sourceRecordId === recordId)) return "readonly" as const;
  if (list.hasMore || current.status === "archived") return "unknown" as const;
  return current;
}
export function StoreAdminInvitationSource({ recordId, canManage }: { recordId?: string; canManage: boolean }) {
  const [state, setState] = useState<"loading" | "editable" | "readonly" | "unknown">(recordId ? "loading" : "editable");
  useEffect(() => {
    if (!recordId || !canManage) return;
    let active = true; setState("loading");
    void invitationManagementClient.list().then(list => { if (active) setState(list.items.some(item => item.sourceRecordId === recordId) ? "readonly" : list.hasMore ? "unknown" : "editable"); }, () => { if (active) setState("unknown"); });
    return () => { active = false; };
  }, [recordId, canManage]);
  if (!canManage) return <p role="alert">Yalnız mağaza sahibi davet kaydı oluşturabilir veya düzenleyebilir.</p>;
  if (state !== "editable") return <section><h1>Yönetici daveti</h1><p role={state === "unknown" ? "alert" : "status"}>{state === "loading" ? "Davet durumu doğrulanıyor…" : state === "readonly" ? "Gönderilmiş davetin kişi, rol ve bitiş bilgileri değiştirilemez." : "Davet durumu doğrulanamadı. Düzenleme kapalı."}</p><a href="/settings/administrators">Davetlere dön</a></section>;
  return <MerchantRecordEditor kind="administrator_invite" recordId={recordId} returnTo="/settings/administrators" canManage saveLabel="Kaydet (göndermez)" preserveOnError recoverInvitationSource={recoverInvitationSource} />;
}
