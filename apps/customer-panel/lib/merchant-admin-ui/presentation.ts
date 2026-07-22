import type {
  MerchantAdminJson,
  MerchantAdminRecord,
  MerchantAdminRecordKind,
  MerchantAdminRecordStatus,
} from "@celebix/saas-contracts";

export type MerchantModuleFieldType =
  | "boolean"
  | "email"
  | "number"
  | "text"
  | "textarea"
  | "url";

export type MerchantModuleFamily =
  | "accounting"
  | "content"
  | "discounts"
  | "marketplaces"
  | "marketing"
  | "seo"
  | "settings";

export interface MerchantModuleFieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly type: MerchantModuleFieldType;
}

export interface MerchantModuleDefinition {
  readonly description: string;
  readonly execution: "durable" | "provider_required";
  readonly family: MerchantModuleFamily;
  readonly fields: readonly MerchantModuleFieldDefinition[];
  readonly kind: MerchantAdminRecordKind;
  readonly notice?: string;
  readonly route: string;
  readonly singular: string;
  readonly title: string;
}

export type MerchantModuleStatusFilter = MerchantAdminRecordStatus | "all";

function field(
  key: string,
  label: string,
  type: MerchantModuleFieldType = "text",
  placeholder?: string,
): MerchantModuleFieldDefinition {
  return Object.freeze({ key, label, type, ...(placeholder ? { placeholder } : {}) });
}

function definition(
  value: Omit<MerchantModuleDefinition, "execution" | "fields"> &
    Readonly<{
      execution?: MerchantModuleDefinition["execution"];
      fields: readonly MerchantModuleFieldDefinition[];
    }>,
): MerchantModuleDefinition {
  return Object.freeze({
    ...value,
    execution: value.execution ?? "durable",
    fields: Object.freeze([...value.fields]),
  });
}

const PROVIDER_NOTICE =
  "Harici çalıştırma, yalnız sunucuya tanımlı ve doğrulanmış sağlayıcı etkinleştirildiğinde açılır.";

export const MERCHANT_MODULE_DEFINITIONS = Object.freeze([
  definition({ kind: "discount", family: "discounts", route: "/discounts", title: "İndirimler", singular: "indirim", description: "Kupon, sepet koşulu, kullanım sınırı ve yayın durumunu yönetin.", fields: [field("code", "Kupon kodu"), field("discountType", "İndirim türü", "text", "percent veya fixed"), field("value", "İndirim değeri", "number"), field("minimumOrderCents", "Minimum sepet (kuruş)", "number"), field("usageLimit", "Kullanım sınırı", "number")] }),
  definition({ kind: "lucky_wheel", family: "discounts", route: "/discounts/lucky-wheel", title: "Şans Çarkı", singular: "çark kampanyası", description: "Çark görünümü, katılım koşulları ve ödül havuzunu kalıcı olarak yönetin.", fields: [field("campaignMessage", "Kampanya mesajı"), field("terms", "Koşullar", "textarea"), field("dailySpinLimit", "Günlük çevirme sınırı", "number"), field("prizeLabels", "Ödüller", "textarea", "Her satıra bir ödül")] }),
  definition({ kind: "email_campaign", family: "marketing", route: "/marketing/email", title: "E-posta Kampanyaları", singular: "e-posta kampanyası", description: "İzinli hedef kitle için kampanya taslağı ve yayın planını yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, fields: [field("subject", "Konu"), field("audience", "İzinli hedef kitle"), field("content", "İçerik", "textarea"), field("scheduledAt", "Planlanan zaman")] }),
  definition({ kind: "phone_campaign", family: "marketing", route: "/marketing/phone", title: "Telefon Kampanyaları", singular: "telefon kampanyası", description: "İzinli telefon kitlesi için arama kampanyası taslaklarını yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, fields: [field("audience", "İzinli hedef kitle"), field("script", "Arama metni", "textarea"), field("scheduledAt", "Planlanan zaman")] }),
  definition({ kind: "whatsapp_campaign", family: "marketing", route: "/marketing/whatsapp", title: "WhatsApp Kampanyaları", singular: "WhatsApp kampanyası", description: "İzinli WhatsApp kitlesi için mesaj taslaklarını yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, fields: [field("audience", "İzinli hedef kitle"), field("message", "Mesaj", "textarea"), field("scheduledAt", "Planlanan zaman")] }),
  definition({ kind: "blog_post", family: "content", route: "/content/blog", title: "Blog", singular: "blog yazısı", description: "Yerelleştirilmiş blog yazılarını taslak veya yayında yönetin.", fields: [field("slug", "URL anahtarı"), field("locale", "Dil", "text", "tr-TR"), field("excerpt", "Özet", "textarea"), field("body", "İçerik", "textarea"), field("published", "Yayında", "boolean")] }),
  definition({ kind: "page", family: "content", route: "/content/pages", title: "Sayfalar", singular: "sayfa", description: "Mağazanın kalıcı içerik sayfalarını yönetin.", fields: [field("slug", "URL anahtarı"), field("locale", "Dil"), field("body", "İçerik", "textarea"), field("published", "Yayında", "boolean")] }),
  definition({ kind: "policy", family: "content", route: "/content/policies", title: "Politikalar", singular: "politika", description: "Mesafeli satış, gizlilik ve iade politikası sürümlerini yönetin.", fields: [field("policyType", "Politika türü"), field("locale", "Dil"), field("body", "Politika metni", "textarea"), field("effectiveAt", "Yürürlük zamanı")] }),
  definition({ kind: "marketplace_connection", family: "marketplaces", route: "/marketplaces", title: "Pazar Yerleri", singular: "pazar yeri bağlantısı", description: "Pazar yeri hesap eşlemesi ve senkronizasyon tercihlerini yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, fields: [field("provider", "Pazar yeri"), field("merchantReference", "Mağaza referansı"), field("syncEnabled", "Senkronizasyon isteği", "boolean")] }),
  definition({ kind: "general_setting", family: "settings", route: "/settings/general", title: "Genel Ayarlar", singular: "genel ayar profili", description: "Mağaza görünen adı, destek adresi ve saat dilimini yönetin.", fields: [field("storeDisplayName", "Mağaza adı"), field("supportEmail", "Destek e-postası", "email"), field("timezone", "Saat dilimi", "text", "Europe/Istanbul")] }),
  definition({ kind: "language_setting", family: "settings", route: "/settings/language", title: "Dil Ayarları", singular: "dil profili", description: "Varsayılan ve etkin mağaza dillerini yönetin.", fields: [field("defaultLocale", "Varsayılan dil"), field("enabledLocales", "Etkin diller", "textarea", "Her satıra bir dil")] }),
  definition({ kind: "payment_setting", family: "settings", route: "/settings/payment", title: "Ödeme Ayarları", singular: "ödeme profili", description: "Müşteriye sunulan ödeme yöntemlerinin görünümünü yönetin.", notice: "Sağlayıcı kimlik bilgileri yalnız sunucu ortamında kalır ve bu ekranda alınmaz.", fields: [field("enabledMethods", "Etkin yöntemler", "textarea"), field("cashOnDelivery", "Kapıda ödeme", "boolean")] }),
  definition({ kind: "shipping_setting", family: "settings", route: "/settings/shipping", title: "Kargo Ayarları", singular: "kargo profili", description: "Teslimat bölgeleri ve ücretsiz kargo eşiğini yönetin.", fields: [field("regions", "Teslimat bölgeleri", "textarea"), field("freeShippingThresholdCents", "Ücretsiz kargo eşiği (kuruş)", "number"), field("estimatedDays", "Tahmini gün", "number")] }),
  definition({ kind: "administrator_invite", family: "settings", route: "/settings/administrators", title: "Yöneticiler", singular: "yönetici daveti", description: "Mağaza ekip davetlerini rol bazında yönetin.", fields: [field("email", "E-posta", "email"), field("role", "Rol", "text", "admin, editor veya analyst"), field("expiresAt", "Son geçerlilik")] }),
  definition({ kind: "accounting_profile", family: "accounting", route: "/accounting", title: "Muhasebe", singular: "muhasebe profili", description: "Fatura kimliği ve mali işletme bilgilerini yönetin.", fields: [field("legalName", "Ticari unvan"), field("taxOffice", "Vergi dairesi"), field("taxNumber", "Vergi numarası"), field("invoiceEmail", "Fatura e-postası", "email")] }),
  definition({ kind: "invoice_integration", family: "accounting", route: "/accounting/invoicing-integration", title: "Fatura Entegrasyonu", singular: "fatura entegrasyonu", description: "Fatura sağlayıcısı hesap eşlemesini ve durumunu yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, fields: [field("provider", "Sağlayıcı"), field("accountReference", "Hesap referansı"), field("enabled", "Etkinleştirme isteği", "boolean")] }),
  definition({ kind: "seo_control", family: "seo", route: "/seo", title: "SEO Kontrol", singular: "SEO profili", description: "Mağaza arama görünürlüğü ve varsayılan meta alanlarını yönetin.", fields: [field("metaTitle", "Meta başlık"), field("metaDescription", "Meta açıklama", "textarea"), field("allowIndex", "İndekslemeye izin ver", "boolean")] }),
  definition({ kind: "sitemap", family: "seo", route: "/seo/sitemap", title: "Site Haritası", singular: "site haritası profili", description: "Site haritasına dahil edilen içerik ailelerini yönetin.", fields: [field("includeProducts", "Ürünleri dahil et", "boolean"), field("includeContent", "İçerikleri dahil et", "boolean"), field("changeFrequency", "Güncelleme sıklığı")] }),
  definition({ kind: "social_preview", family: "seo", route: "/seo/social-preview", title: "Sosyal Önizleme", singular: "sosyal önizleme", description: "Paylaşım başlığı, açıklaması ve görselini yönetin.", fields: [field("title", "Başlık"), field("description", "Açıklama", "textarea"), field("imageUrl", "Görsel URL", "url")] }),
  definition({ kind: "code_integration", family: "seo", route: "/seo/code-integrations", title: "Kod Entegrasyonları", singular: "kod entegrasyonu", description: "Kamuya açık doğrulama ve ölçüm kimliklerini yönetin.", notice: "Çalıştırılabilir kod veya gizli anahtar kabul edilmez.", fields: [field("provider", "Servis"), field("publicIdentifier", "Kamuya açık kimlik"), field("enabled", "Etkin", "boolean")] }),
  definition({ kind: "indexing_request", family: "seo", route: "/seo/fast-indexing", title: "Hızlı İndeksleme", singular: "indeksleme isteği", description: "İndekslenmesi istenen güvenli URL kümelerini taslak olarak yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, fields: [field("urls", "URL listesi", "textarea"), field("reason", "İstek nedeni", "textarea")] }),
] as const satisfies readonly MerchantModuleDefinition[]);

const DEFINITIONS = new Map(
  MERCHANT_MODULE_DEFINITIONS.map((entry) => [entry.kind, entry] as const),
);

export function getMerchantModuleDefinition(
  kind: MerchantAdminRecordKind,
): MerchantModuleDefinition {
  const result = DEFINITIONS.get(kind);
  if (!result) throw new TypeError("merchant_module_definition_unavailable");
  return result;
}

export function buildMerchantModuleSummary(
  records: readonly MerchantAdminRecord[],
  query: string,
  status: MerchantModuleStatusFilter,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const visible = Object.freeze(records.filter((record) =>
    (status === "all" || record.status === status) &&
    (!normalizedQuery || record.name.toLocaleLowerCase("tr-TR").includes(normalizedQuery)),
  ));
  return Object.freeze({
    active: records.filter(({ status: value }) => value === "active").length,
    archived: records.filter(({ status: value }) => value === "archived").length,
    draft: records.filter(({ status: value }) => value === "draft").length,
    total: records.length,
    visible,
  });
}

function displayValue(value: MerchantAdminJson): string | null {
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value)) {
    const safe = value.filter((entry): entry is string => typeof entry === "string");
    return safe.length === value.length ? safe.join(", ") : null;
  }
  return null;
}

export function formatMerchantAdminConfig(
  definition: MerchantModuleDefinition,
  config: Readonly<Record<string, MerchantAdminJson>>,
) {
  return Object.freeze(definition.fields.flatMap((entry) => {
    if (!Object.hasOwn(config, entry.key)) return [];
    const value = displayValue(config[entry.key]!);
    return value === null ? [] : [Object.freeze({ label: entry.label, value })];
  }));
}
