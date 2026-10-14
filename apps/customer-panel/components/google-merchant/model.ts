import { googleMerchantGtinValid, type GoogleMerchantAttributes, type GoogleMerchantProduct, type GoogleMerchantStatus } from "@celebix/saas-contracts";

export function productStatus(status: GoogleMerchantStatus): { label: string; tone: "neutral" | "success" | "warning" | "danger" } {
  const labels: Record<GoogleMerchantStatus, string> = { ready: "Aktarıma hazır", pending: "Sırada", submitted: "Google’a gönderildi", approved: "Google onayladı", limited: "Sınırlı gösterim", disapproved: "Google reddetti", excluded: "Aktarılmıyor", failed: "Aktarılamadı", withdrawn: "Google’dan kaldırıldı" };
  return { label: labels[status], tone: status === "approved" ? "success" : status === "disapproved" || status === "failed" ? "danger" : status === "limited" || status === "excluded" ? "warning" : "neutral" };
}
export function failureMessage(code: string) {
  if (["membership_denied", "durable_authority_invalid"].includes(code)) return "Bu işlemi yapamıyorsunuz. Oturumunuzu ve yetkinizi kontrol edin.";
  if (["connection_required", "needs_reconnect"].includes(code)) return "Önce Google Merchant bağlantısını tamamlayın.";
  if (code === "invalid_input") return "Ürün bilgilerini kontrol edin. Yalnız üreticinin verdiği geçerli barkodu kullanın.";
  if (code === "operation_mismatch" || code === "version_conflict") return "Ürün başka bir işlemde değişti. Güncel listeyi yükleyin.";
  if (code === "not_found") return "Ürün bulunamadı. Güncel listeyi yükleyin.";
  return "İşlemin sonucu doğrulanamadı. Bilgileriniz korundu; aynı işlemi tekrar deneyin.";
}
export type AttributeDraft = Record<"gtin" | "mpn" | "color" | "size" | "material" | "gender" | "ageGroup", string> & { identifierExists: "" | "yes" | "no" };
export function attributeDraft(product: GoogleMerchantProduct): AttributeDraft {
  const a = product.attributes;
  return { gtin: a.gtin ?? "", mpn: a.mpn ?? "", color: a.color ?? "", size: a.size ?? "", material: a.material ?? "", gender: a.gender ?? "", ageGroup: a.ageGroup ?? "", identifierExists: a.identifierExists === undefined ? "" : a.identifierExists ? "yes" : "no" };
}
export function attributesFromDraft(draft: AttributeDraft): GoogleMerchantAttributes | null {
  const values: Record<string, unknown> = {};
  for (const key of ["gtin", "mpn", "color", "size", "material", "gender", "ageGroup"] as const) {
    const value = draft[key].trim();
    if (value.length > (key === "gtin" ? 14 : 70) || /[\x00-\x1f\x7f<>]/u.test(value)) return null;
    if (value) values[key] = value;
  }
  if (typeof values.gtin === "string" && !googleMerchantGtinValid(values.gtin)) return null;
  if (draft.identifierExists !== "") values.identifierExists = draft.identifierExists === "yes";
  if (values.identifierExists === false && (values.gtin || values.mpn)) return null;
  if (values.gender && !["male", "female", "unisex"].includes(String(values.gender))) return null;
  if (values.ageGroup && !["newborn", "infant", "toddler", "kids", "adult"].includes(String(values.ageGroup))) return null;
  return values as GoogleMerchantAttributes;
}
export function lastSyncLabel(value: string | null): string {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(value)) : "Henüz tamamlanmadı";
}
