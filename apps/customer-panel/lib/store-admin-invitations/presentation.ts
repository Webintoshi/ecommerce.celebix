import { normalizeStoreAdminInvitationEmail, type MerchantAdminRecord, type StoreAdminInvitationDeliveryStatus, type StoreAdminInvitationView } from "@celebix/saas-contracts";
export type InvitationList = Readonly<{ items: readonly StoreAdminInvitationView[]; hasMore: boolean }>;
const lifecycle = { pending: "Kabul bekliyor", accepted: "Davet kabul edildi", revoked: "İptal edildi", expired: "Süresi doldu" };
const delivery = { queued: "Gönderim kuyruğunda", sending: "Gönderiliyor", provider_accepted: "E-posta sağlayıcısı kabul etti", delivered: "Teslim edildi", failed: "Gönderilemedi", outcome_unknown: "Gönderim sonucu belirsiz" };
export function deliveryLabel(status: StoreAdminInvitationDeliveryStatus | null) { return status === null ? "—" : delivery[status]; }
function validSource(record: MerchantAdminRecord, now: Date) {
  try {
    const { email, role, expiresAt } = record.config;
    if (record.status !== "active" || normalizeStoreAdminInvitationEmail(email) !== email || typeof role !== "string" || !["admin", "editor", "analyst"].includes(role) || typeof expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiresAt)) return false;
    return Date.parse(expiresAt) > +now && new Date(expiresAt).toISOString() === (expiresAt.length === 20 ? expiresAt.replace("Z", ".000Z") : expiresAt);
  } catch { return false; }
}
export function invitationRows(records: readonly MerchantAdminRecord[], list: InvitationList | null, now: Date) {
  const bySource = new Map(list?.items.map(item => [item.sourceRecordId, item]));
  const sources = new Map(records.filter(record => record.kind === "administrator_invite").map(source => [source.id, source]));
  const ids = new Set([...sources.keys(), ...bySource.keys()]);
  return [...ids].map(sourceRecordId => {
    const source = sources.get(sourceRecordId), invitation = bySource.get(sourceRecordId), knownUnsent = list !== null && !list.hasMore && !invitation;
    const livePending = invitation?.status === "pending" && Date.parse(invitation.expiresAt) > +now;
    return { sourceRecordId, source, invitation, name: invitation?.displayName ?? source?.name ?? "", email: invitation?.email ?? String(source?.config.email ?? ""), role: invitation?.role ?? String(source?.config.role ?? ""), label: invitation ? lifecycle[invitation.status === "pending" && !livePending ? "expired" : invitation.status] : knownUnsent ? "Henüz gönderilmedi" : "Durum doğrulanamadı", canSend: Boolean(knownUnsent && source && validSource(source, now)), canEdit: Boolean(knownUnsent && source && source.status !== "archived"), canResend: Boolean(livePending && invitation && invitation.deliveryStatus !== "sending" && +now - Date.parse(invitation.updatedAt) >= 60000), canRevoke: Boolean(livePending) };
  });
}
