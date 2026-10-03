import { PLAN_FEATURE_KEYS, PLAN_LIMIT_KEYS } from "@celebix/saas-contracts";
import { moneyToCents, nonnegativeInteger } from "./command";
import type { CommandSpec, Draft, Field, Membership, Period, Plan, Receipt, Store, SupportSession } from "./types";

export const featureLabels: Record<string, string> = { catalog: "Ürün kataloğu", orders: "Siparişler", customers: "Müşteriler", content: "İçerik", media: "Medya", analytics: "Analitik", checkout: "Web ödeme", custom_domains: "Özel alan adı", staff_management: "Personel yönetimi", promotions: "Kampanyalar", integrations: "Entegrasyonlar", accounting: "Muhasebe ve POS", marketplaces: "Pazaryerleri" };
export const limitLabels: Record<string, string> = { products: "Ürün", staff: "Personel", storageBytes: "Depolama (bayt)", monthlyOrders: "Aylık sipariş", customDomains: "Özel alan adı" };
const reason: Field = { name: "reason", label: "İşlem nedeni", type: "textarea", required: true };
const required = (name: string, fieldLabel: string, type?: Field["type"]): Field => ({ name, label: fieldLabel, type, required: true });
const text = (draft: Draft, name: string) => String(draft[name] ?? "").trim();
const storeEndpoint = "/api/platform/stores";

export function ownershipCommand(store: Store, transfer = false): CommandSpec {
  return { title: transfer ? "Sahiplik devri daveti" : "Üye davet et", description: "E-posta adresine davet oluşturun. Yeni veya mevcut kullanıcı adresini doğrulayıp kabul edene kadar erişim verilmez.", endpoint: "/api/platform/invitations", action: "ownership.invite", resourceId: store.id, expectedVersion: store.version, initial: { targetEmail: "", targetPrincipalId: "", role: transfer ? "store_owner" : "admin", previousOwnerDisposition: "admin" }, fields: [
    { ...required("targetEmail", "Davet edilecek e-posta", "verified-account") },
    ...(transfer ? [{ name: "previousOwnerDisposition", label: "Önceki mağaza sahibinin yetkisi", type: "select" as const, required: true, options: [{ value: "admin", label: "Yönetici olarak kalsın" }, { value: "revoked", label: "Üyeliği iptal edilsin" }] }] : [{ name: "role", label: "Rol", type: "select" as const, required: true, options: [{ value: "admin", label: "Yönetici" }, { value: "editor", label: "Editör" }, { value: "analyst", label: "Analist" }, { value: "cashier", label: "Kasiyer" }, { value: "store_owner", label: "Mağaza sahibi" }] }]),
  ], payload: draft => {
    const targetEmail = text(draft, "targetEmail").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) throw new Error("Geçerli bir davet e-posta adresi girin.");
    return { storeId: store.id, targetEmail, ...(text(draft, "targetPrincipalId") ? { targetPrincipalId: text(draft, "targetPrincipalId") } : {}), role: transfer ? "store_owner" : text(draft, "role"), kind: transfer ? "transfer" : "invite", ...(transfer ? { previousOwnerDisposition: text(draft, "previousOwnerDisposition") } : {}) };
  } };
}

export function publishPlanCommand(plans: Plan[], base?: Plan): CommandSpec {
  const initial: Draft = { code: base?.code || "", monthlyPrice: base?.monthlyPriceCents == null ? "" : String(base.monthlyPriceCents / 100), yearlyPrice: base?.yearlyPriceCents == null ? "" : String(base.yearlyPriceCents / 100) };
  for (const key of PLAN_FEATURE_KEYS) initial[`feature.${key}`] = base?.features[key] ?? false;
  for (const key of PLAN_LIMIT_KEYS) initial[`limit.${key}`] = base?.limits[key] !== undefined ? String(base.limits[key]) : "";
  const optionalPrice = (value: string) => value === "" ? null : /^0(?:[.,]0{1,2})?$/.test(value) ? 0 : moneyToCents(value);
  return { title: base ? "Yeni paket sürümü yayınla" : "Paket yayınla", description: "Yayınlanan sürümler değiştirilemez. Mevcut abonelikler siz yeni sürümü atayana kadar korunur. Fiyatlar tarife bilgisidir; borç dönemleri ayrı kaydedilir.", endpoint: "/api/platform/plans", action: "plan.publish", expectedVersion: base ? Math.max(...plans.filter(plan => plan.code === base.code).map(plan => plan.version)) : 0, initial, fields: [{ ...required("code", "Paket kodu"), readOnly: Boolean(base) }, { name: "monthlyPrice", label: "Aylık tarife (TL)", help: "Bilinmiyorsa boş bırakın. Ücretsiz paket için açıkça 0 girin." }, { name: "yearlyPrice", label: "Yıllık tarife (TL)", help: "Bilinmiyorsa boş bırakın." }, ...PLAN_FEATURE_KEYS.map(key => ({ name: `feature.${key}`, label: featureLabels[key], type: "checkbox" as const })), ...PLAN_LIMIT_KEYS.map(key => ({ name: `limit.${key}`, label: limitLabels[key], type: "number" as const, min: 0, step: "1", required: true }))], payload: draft => ({ code: text(draft, "code"), monthlyPriceCents: optionalPrice(text(draft, "monthlyPrice")), yearlyPriceCents: optionalPrice(text(draft, "yearlyPrice")), features: Object.fromEntries(PLAN_FEATURE_KEYS.map(key => [key, Boolean(draft[`feature.${key}`])])), limits: Object.fromEntries(PLAN_LIMIT_KEYS.map(key => [key, nonnegativeInteger(text(draft, `limit.${key}`))])) }) };
}

export function assignPlanCommand(store: Store, plans: Plan[]): CommandSpec {
  return { title: "Paket ata", description: "Kullanım sınırları ve bekleyen POS işlemleri sunucuda kontrol edilir. Ticari vade teknik abonelik süresini değiştirmez.", endpoint: "/api/platform/subscriptions", action: "subscription.assign", resourceId: store.id, expectedVersion: store.version, initial: { planId: store.subscription?.planId || "" }, fields: [{ ...required("planId", "Paket sürümü", "select"), options: plans.filter(plan => plan.status === "active" || plan.status === "published").map(plan => ({ value: plan.id, label: `${plan.code} · v${plan.version}` })) }], payload: draft => ({ storeId: store.id, planId: text(draft, "planId") }) };
}

export function periodCommand(store: Store): CommandSpec {
  return { title: "Borç dönemi oluştur", description: "Gerçek platform hizmet bedelini girin. Vade geçişi yalnızca uyarı üretir; satışları otomatik durdurmaz.", endpoint: "/api/platform/billing", action: "billing.period.create", resourceId: store.id, expectedVersion: store.version, initial: { label: "", startsOn: "", endsOn: "", dueOn: "", amount: "" }, fields: [required("label", "Dönem açıklaması"), required("startsOn", "Başlangıç tarihi", "date"), required("endsOn", "Bitiş tarihi", "date"), required("dueOn", "Ödeme vadesi", "date"), { ...required("amount", "Borç tutarı (TL)"), help: "Örnek: 1250,50. Tutar kuruş olarak saklanır." }], payload: draft => { const startsOn = text(draft, "startsOn"), endsOn = text(draft, "endsOn"); if (endsOn < startsOn) throw new Error("Bitiş tarihi başlangıç tarihinden önce olamaz."); return { storeId: store.id, label: text(draft, "label"), startsOn, endsOn, dueOn: text(draft, "dueOn"), amountCents: moneyToCents(text(draft, "amount")) }; } };
}

export function receiptCommand(store: Store, period: Period): CommandSpec {
  return { title: "Tahsilat kaydet", description: `${period.label} için gerçek tahsilatı kaydedin. Kısmi ödeme kabul edilir; kalan borçtan fazla tahsilat kaydedilemez.`, endpoint: "/api/platform/billing", action: "billing.receipt.record", resourceId: store.id, expectedVersion: store.version, initial: { amount: "", method: "bank_transfer", reference: "" }, fields: [required("amount", "Tahsil edilen tutar (TL)"), { ...required("method", "Tahsilat yöntemi", "select"), options: [{ value: "bank_transfer", label: "Banka havalesi" }, { value: "cash", label: "Nakit" }, { value: "card", label: "Kart" }] }, required("reference", "Dekont / kayıt referansı")], payload: draft => { const amountCents = moneyToCents(text(draft, "amount")); if (amountCents > period.remainingCents) throw new Error("Tahsilat kalan borcu aşamaz."); return { storeId: store.id, periodId: period.id, amountCents, method: text(draft, "method"), reference: text(draft, "reference") }; } };
}

export function reverseReceiptCommand(store: Store, receipt: Receipt): CommandSpec {
  return { title: "Tahsilatı ters kaydet", description: "İlk kayıt geçmişte korunur. Gerekçeli karşı kayıt borcu yeniden açar.", endpoint: "/api/platform/billing", action: "billing.receipt.reverse", resourceId: store.id, expectedVersion: store.version, initial: { reason: "" }, fields: [reason], payload: draft => ({ storeId: store.id, receiptId: receipt.id, reason: text(draft, "reason") }) };
}

export function adjustPeriodCommand(store: Store, period: Period): CommandSpec {
  return { title: "Dönem borcunu düzelt", description: "İlk ücret kaydı korunur. Ek bedel borcu artırır; indirim borcu azaltır. Tahsil edilen tutarın altına düşürülemez.", endpoint: "/api/platform/billing", action: "billing.period.adjust", resourceId: store.id, expectedVersion: period.version, initial: { periodId: period.id, direction: "credit", amount: "", reason: "" }, fields: [{ ...required("direction", "Düzeltme türü", "select"), options: [{ value: "credit", label: "Borçtan düş (indirim)" }, { value: "charge", label: "Ek bedel ekle" }] }, required("amount", "Düzeltme tutarı (TL)"), reason], payload: draft => { const amountCents = moneyToCents(text(draft, "amount")); const deltaCents = text(draft, "direction") === "credit" ? -amountCents : amountCents; if (period.amountCents + deltaCents < period.collectedCents) throw new Error("Düzeltilen borç tahsil edilmiş tutardan az olamaz."); return { storeId: store.id, periodId: period.id, deltaCents, reason: text(draft, "reason") }; } };
}

export function salesCommand(store: Store): CommandSpec {
  const paused = store.salesPolicy?.paused;
  return { title: paused ? "Yeni satışları aç" : "Yeni satışları duraklat", description: "Yalnızca yeni web/POS satışları etkilenir. Mağaza gezintisi, yönetim ve mevcut siparişlerin ödeme, tahsilat ve iade süreçleri devam eder.", endpoint: storeEndpoint, action: paused ? "sales.resume" : "sales.pause", resourceId: store.id, expectedVersion: store.salesPolicy?.version ?? 1, initial: { reason: "" }, fields: [reason], payload: draft => ({ storeId: store.id, reason: text(draft, "reason") }) };
}

export function supportCommand(store: Store, onSuccess: CommandSpec["onSuccess"]): CommandSpec {
  return { title: "Destek oturumu aç", description: "Oturum 30 dakika sürer. İşlemler gerçek operatör kimliğiyle kaydedilir; mağaza sahibinin hesabı kullanılmaz.", endpoint: "/api/platform/support-sessions", action: "support.issue", expectedVersion: 1, initial: { adminHost: store.adminHost || "", reason: "" }, fields: [{ ...required("adminHost", "Doğrulanmış yönetim alan adı"), readOnly: true }, reason], payload: draft => ({ storeId: store.id, adminHost: text(draft, "adminHost"), reason: text(draft, "reason") }), onSuccess };
}

export function revokeSupportCommand(session: SupportSession): CommandSpec {
  return { title: "Destek oturumunu iptal et", description: "Oturumun kalan erişimi iptal edilir; yapılan işlemler geçmişte korunur.", endpoint: "/api/platform/support-sessions", action: "support.revoke", expectedVersion: session.version, initial: {}, fields: [], payload: () => ({ sessionId: session.id }) };
}

export function membershipCommand(store: Store, member: Membership): CommandSpec {
  return { title: "Üye yetkisini güncelle", description: "Sahiplik devri davetle ve hedef kişinin kabulüyle yapılır. Davet edilen üyeler kabul edene kadar etkinleştirilemez. Son aktif sahip kaldırılamaz.", endpoint: "/api/platform/memberships", action: "membership.update", resourceId: store.id, expectedVersion: store.version, initial: { role: member.role, status: member.status }, fields: [{ ...required("role", "Rol", "select"), options: (member.role === "store_owner" ? ["store_owner", "admin", "editor", "analyst", "cashier"] : ["admin", "editor", "analyst", "cashier"]).map(role => ({ value: role, label: ({ store_owner: "Mağaza sahibi", admin: "Yönetici", editor: "Editör", analyst: "Analist", cashier: "Kasiyer" } as Record<string, string>)[role] })) }, { ...required("status", "Üyelik durumu", "select"), options: [...(member.status !== "invited" ? [{ value: "active", label: "Aktif" }] : []), { value: "invited", label: "Davet edildi" }, { value: "revoked", label: "İptal edildi" }] }], payload: draft => ({ storeId: store.id, membershipId: member.id, role: text(draft, "role"), status: text(draft, "status") }) };
}
