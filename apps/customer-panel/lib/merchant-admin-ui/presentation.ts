import type {
  MerchantAdminJson,
  MerchantAdminProviderAction,
  MerchantAdminRecord,
  MerchantAdminRecordKind,
  MerchantAdminRecordStatus,
} from "@celebix/saas-contracts";

export type MerchantModuleFieldType =
  | "boolean"
  | "datetime"
  | "email"
  | "enum"
  | "number"
  | "string-list"
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
  readonly allowedValues?: readonly string[];
  readonly optionLabels?: Readonly<Record<string, string>>;
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
  readonly workflow?: Readonly<{
    action: MerchantAdminProviderAction;
    actionLabel: string;
    requiredFields: readonly string[];
  }>;
}

export type MerchantModuleStatusFilter = MerchantAdminRecordStatus | "all";

function field(
  key: string,
  label: string,
  type: MerchantModuleFieldType = "text",
  placeholder?: string,
  allowedValues?: readonly string[],
  optionLabels?: Readonly<Record<string, string>>,
): MerchantModuleFieldDefinition {
  return Object.freeze({ key, label, type, ...(placeholder ? { placeholder } : {}), ...(allowedValues ? { allowedValues: Object.freeze([...allowedValues]) } : {}), ...(optionLabels ? { optionLabels: Object.freeze({ ...optionLabels }) } : {}) });
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
    ...(value.workflow ? { workflow: Object.freeze({ ...value.workflow, requiredFields: Object.freeze([...value.workflow.requiredFields]) }) } : {}),
  });
}

const PROVIDER_NOTICE =
  "Harici çalıştırma, yalnız sunucuya tanımlı ve doğrulanmış sağlayıcı etkinleştirildiğinde açılır.";

export const MERCHANT_MODULE_DEFINITIONS = Object.freeze([
  definition({ kind: "discount", family: "discounts", route: "/discounts", title: "İndirimler", singular: "indirim", description: "Kupon, sepet koşulu, kullanım sınırı ve yayın durumunu yönetin.", fields: [field("code", "Kupon kodu"), field("discountType", "İndirim türü", "text", "percent veya fixed"), field("value", "İndirim değeri", "number"), field("minimumOrderCents", "Minimum sepet (kuruş)", "number"), field("usageLimit", "Kullanım sınırı", "number")] }),
  definition({ kind: "lucky_wheel", family: "discounts", route: "/discounts/lucky-wheel", title: "Şans Çarkı", singular: "çark kampanyası", description: "Çark görünümü, katılım koşulları ve ödül havuzunu kalıcı olarak yönetin.", fields: [field("campaignMessage", "Kampanya mesajı"), field("terms", "Koşullar", "textarea"), field("dailySpinLimit", "Günlük çevirme sınırı", "number"), field("prizeLabels", "Ödüller", "textarea", "Her satıra bir ödül")] }),
  definition({ kind: "email_campaign", family: "marketing", route: "/marketing/email", title: "E-posta Kampanyaları", singular: "e-posta kampanyası", description: "İzinli hedef kitle için kampanya taslağı ve yayın planını yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, workflow: { action: "delivery", actionLabel: "Teslimat hazırlığı", requiredFields: ["subject", "audience", "content"] }, fields: [field("subject", "Konu"), field("audience", "İzinli hedef kitle"), field("content", "İçerik", "textarea"), field("scheduledAt", "Planlanan zaman")] }),
  definition({ kind: "phone_campaign", family: "marketing", route: "/marketing/phone", title: "Telefon Kampanyaları", singular: "telefon kampanyası", description: "İzinli telefon kitlesi için arama kampanyası taslaklarını yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, workflow: { action: "delivery", actionLabel: "Arama hazırlığı", requiredFields: ["audience", "script"] }, fields: [field("audience", "İzinli hedef kitle"), field("script", "Arama metni", "textarea"), field("scheduledAt", "Planlanan zaman")] }),
  definition({ kind: "whatsapp_campaign", family: "marketing", route: "/marketing/whatsapp", title: "WhatsApp Kampanyaları", singular: "WhatsApp kampanyası", description: "İzinli WhatsApp kitlesi için mesaj taslaklarını yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, workflow: { action: "delivery", actionLabel: "Mesaj hazırlığı", requiredFields: ["audience", "message"] }, fields: [field("audience", "İzinli hedef kitle"), field("message", "Mesaj", "textarea"), field("scheduledAt", "Planlanan zaman")] }),
  definition({ kind: "blog_post", family: "content", route: "/content/blog", title: "Blog", singular: "blog yazısı", description: "Yerelleştirilmiş blog yazılarını taslak veya yayında yönetin.", fields: [field("slug", "URL anahtarı"), field("locale", "Dil", "text", "tr-TR"), field("excerpt", "Özet", "textarea"), field("body", "İçerik", "textarea"), field("published", "Yayında", "boolean")] }),
  definition({ kind: "page", family: "content", route: "/content/pages", title: "Sayfalar", singular: "sayfa", description: "Mağazanın kalıcı içerik sayfalarını yönetin.", fields: [field("slug", "URL anahtarı"), field("locale", "Dil"), field("body", "İçerik", "textarea"), field("published", "Yayında", "boolean")] }),
  definition({ kind: "policy", family: "content", route: "/content/policies", title: "Politikalar", singular: "politika", description: "Mesafeli satış, gizlilik ve iade politikası sürümlerini yönetin.", fields: [field("policyType", "Politika türü"), field("locale", "Dil"), field("body", "Politika metni", "textarea"), field("effectiveAt", "Yürürlük zamanı")] }),
  definition({ kind: "marketplace_connection", family: "marketplaces", route: "/marketplaces", title: "Pazar Yerleri", singular: "pazar yeri bağlantısı", description: "Pazar yeri hesap eşlemesi ve senkronizasyon tercihlerini yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, workflow: { action: "synchronization", actionLabel: "Senkronizasyon hazırlığı", requiredFields: ["provider", "merchantReference", "syncEnabled"] }, fields: [field("provider", "Pazar yeri"), field("merchantReference", "Mağaza referansı"), field("syncEnabled", "Senkronizasyon isteği", "boolean")] }),
  definition({ kind: "general_setting", family: "settings", route: "/settings/general", title: "Genel Ayarlar", singular: "genel ayar profili", description: "Mağaza görünen adı, destek adresi ve saat dilimini yönetin.", fields: [field("storeDisplayName", "Mağaza adı"), field("supportEmail", "Destek e-postası", "email"), field("timezone", "Saat dilimi", "text", "Europe/Istanbul")] }),
  definition({ kind: "language_setting", family: "settings", route: "/settings/language", title: "Dil Ayarları", singular: "dil profili", description: "Varsayılan ve etkin mağaza dillerini yönetin.", fields: [field("defaultLocale", "Varsayılan dil"), field("enabledLocales", "Etkin diller", "textarea", "Her satıra bir dil")] }),
  definition({ kind: "payment_setting", family: "settings", route: "/settings/payment", title: "Ödeme Ayarları", singular: "ödeme profili", description: "Müşteriye sunulan ödeme yöntemlerinin görünümünü yönetin.", notice: "Sağlayıcı kimlik bilgileri yalnız sunucu ortamında kalır ve bu ekranda alınmaz.", fields: [field("enabledMethods", "Etkin yöntemler", "textarea"), field("cashOnDelivery", "Kapıda ödeme", "boolean")] }),
  definition({ kind: "shipping_setting", family: "settings", route: "/settings/shipping", title: "Kargo Ayarları", singular: "kargo profili", description: "Teslimat bölgeleri ve ücretsiz kargo eşiğini yönetin.", fields: [field("regions", "Teslimat bölgeleri", "textarea"), field("freeShippingThresholdCents", "Ücretsiz kargo eşiği (kuruş)", "number"), field("estimatedDays", "Tahmini gün", "number")] }),
  definition({ kind: "administrator_invite", family: "settings", route: "/settings/administrators", title: "Yöneticiler", singular: "yönetici daveti", description: "Mağaza ekip davetlerini rol bazında yönetin.", fields: [field("email", "E-posta", "email"), field("role", "Rol", "text", "admin, editor veya analyst"), field("expiresAt", "Son geçerlilik")] }),
  definition({ kind: "notification_setting", family: "settings", route: "/settings/notifications", title: "Bildirimler", singular: "bildirim profili", description: "Kanal tercihlerini gizli sağlayıcı bilgisi almadan yönetin.", fields: [field("emailEnabled", "E-posta", "boolean"), field("smsEnabled", "SMS", "boolean"), field("pushEnabled", "Push", "boolean"), field("senderLabel", "Gönderici etiketi"), field("replyToEmail", "Yanıt adresi", "email")] }),
  definition({ kind: "hero_banner", family: "settings", route: "/settings/hero-banner", title: "Hero Banner", singular: "hero banner", description: "Vitrin kahraman alanını kalıcı olarak yönetin.", fields: [field("headline", "Başlık"), field("body", "Açıklama", "textarea"), field("imageUrl", "Görsel", "url"), field("destination", "Hedef"), field("enabled", "Etkin", "boolean")] }),
  definition({ kind: "promotion_banner", family: "settings", route: "/settings/promotion-banner", title: "Promosyon Banner", singular: "promosyon banner", description: "Zaman aralıklı promosyon mesajını yönetin.", fields: [field("headline", "Başlık"), field("body", "Açıklama", "textarea"), field("destination", "Hedef"), field("startsAt", "Başlangıç", "datetime"), field("endsAt", "Bitiş", "datetime"), field("enabled", "Etkin", "boolean")] }),
  definition({ kind: "marquee_setting", family: "settings", route: "/settings/marquee", title: "Kayan Duyuru", singular: "kayan duyuru", description: "Vitrin duyuru şeridini sınırlı seçeneklerle yönetin.", fields: [field("items", "Duyurular", "string-list", "Her satıra bir duyuru"), field("icon", "Simge", "enum", undefined, ["none", "sparkle", "truck", "shield"], { none: "Yok", sparkle: "Parıltı", truck: "Kamyon", shield: "Kalkan" }), field("speed", "Hız", "enum", undefined, ["slow", "normal", "fast"], { slow: "Yavaş", normal: "Normal", fast: "Hızlı" }), field("direction", "Yön", "enum", undefined, ["left", "right"], { left: "Sola", right: "Sağa" }), field("animation", "Animasyon", "enum", undefined, ["continuous", "step"], { continuous: "Sürekli", step: "Adımlı" }), field("enabled", "Etkin", "boolean")] }),
  definition({ kind: "accounting_profile", family: "accounting", route: "/accounting", title: "Muhasebe", singular: "muhasebe profili", description: "Fatura kimliği ve mali işletme bilgilerini yönetin.", fields: [field("legalName", "Ticari unvan"), field("taxOffice", "Vergi dairesi"), field("taxNumber", "Vergi numarası"), field("invoiceEmail", "Fatura e-postası", "email")] }),
  definition({ kind: "invoice_integration", family: "accounting", route: "/accounting/invoicing-integration", title: "Fatura Entegrasyonu", singular: "fatura entegrasyonu", description: "Fatura sağlayıcısı hesap eşlemesini ve durumunu yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, workflow: { action: "reconciliation", actionLabel: "Uzlaştırma hazırlığı", requiredFields: ["provider", "accountReference", "enabled"] }, fields: [field("provider", "Sağlayıcı"), field("accountReference", "Hesap referansı"), field("enabled", "Etkinleştirme isteği", "boolean")] }),
  definition({ kind: "seo_control", family: "seo", route: "/seo", title: "SEO Kontrol", singular: "SEO profili", description: "Mağaza arama görünürlüğü ve varsayılan meta alanlarını yönetin.", fields: [field("metaTitle", "Meta başlık"), field("metaDescription", "Meta açıklama", "textarea"), field("allowIndex", "İndekslemeye izin ver", "boolean")] }),
  definition({ kind: "sitemap", family: "seo", route: "/seo/sitemap", title: "Site Haritası", singular: "site haritası profili", description: "Site haritasına dahil edilen içerik ailelerini yönetin.", fields: [field("includeProducts", "Ürünleri dahil et", "boolean"), field("includeContent", "İçerikleri dahil et", "boolean"), field("changeFrequency", "Güncelleme sıklığı")] }),
  definition({ kind: "social_preview", family: "seo", route: "/seo/social-preview", title: "Sosyal Önizleme", singular: "sosyal önizleme", description: "Paylaşım başlığı, açıklaması ve görselini yönetin.", fields: [field("title", "Başlık"), field("description", "Açıklama", "textarea"), field("imageUrl", "Görsel URL", "url")] }),
  definition({ kind: "code_integration", family: "seo", route: "/seo/code-integrations", title: "Kod Entegrasyonları", singular: "kod entegrasyonu", description: "Kamuya açık doğrulama ve ölçüm kimliklerini yönetin.", notice: "Çalıştırılabilir kod veya gizli anahtar kabul edilmez.", fields: [field("provider", "Servis"), field("publicIdentifier", "Kamuya açık kimlik"), field("enabled", "Etkin", "boolean")] }),
  definition({ kind: "indexing_request", family: "seo", route: "/seo/fast-indexing", title: "Hızlı İndeksleme", singular: "indeksleme isteği", description: "İndekslenmesi istenen güvenli URL kümelerini taslak olarak yönetin.", execution: "provider_required", notice: PROVIDER_NOTICE, workflow: { action: "indexing", actionLabel: "İndeksleme hazırlığı", requiredFields: ["urls", "reason"] }, fields: [field("urls", "URL listesi", "textarea"), field("reason", "İstek nedeni", "textarea")] }),
  definition({ kind: "seo_geo_profile", family: "seo", route: "/seo/geo-optimization", title: "Coğrafi SEO", singular: "coğrafi SEO profili", description: "İşletme, hizmet alanı ve yerel arama tercihlerini yönetin.", fields: [field("businessName", "İşletme adı"), field("businessCategory", "İşletme kategorisi"), field("serviceAreas", "Hizmet alanları", "string-list", "Her satıra bir alan"), field("locale", "Dil", "text", "tr-TR"), field("description", "Açıklama", "textarea")] }),
  definition({ kind: "seo_internal_link", family: "seo", route: "/seo/internal-linking", title: "İç Bağlantılar", singular: "iç bağlantı", description: "Kanonik mağaza yolları arasındaki iç bağlantıları yönetin.", fields: [field("sourcePath", "Kaynak yol"), field("targetPath", "Hedef yol"), field("anchorText", "Bağlantı metni"), field("enabled", "Etkin", "boolean")] }),
  definition({ kind: "seo_content_entry", family: "seo", route: "/seo/content", title: "İçerik SEO", singular: "içerik SEO kaydı", description: "İçerik kaynaklarının meta ve yapılandırılmış veri tercihlerini yönetin.", fields: [field("resourceId", "Kaynak kimliği"), field("metaTitle", "Meta başlık"), field("metaDescription", "Meta açıklama", "textarea"), field("canonicalPath", "Kanonik yol"), field("structuredDataType", "Yapılandırılmış veri türü", "enum", undefined, ["Article", "FAQPage", "Product", "WebPage"])] }),
  definition({ kind: "seo_category_entry", family: "seo", route: "/seo/categories", title: "Kategori SEO", singular: "kategori SEO kaydı", description: "Kategori kaynaklarının meta ve kanonik yol tercihlerini yönetin.", fields: [field("resourceId", "Kaynak kimliği"), field("metaTitle", "Meta başlık"), field("metaDescription", "Meta açıklama", "textarea"), field("canonicalPath", "Kanonik yol")] }),
  definition({ kind: "seo_page_entry", family: "seo", route: "/seo/pages", title: "Sayfa SEO", singular: "sayfa SEO kaydı", description: "Sayfa kaynaklarının meta ve kanonik yol tercihlerini yönetin.", fields: [field("resourceId", "Kaynak kimliği"), field("metaTitle", "Meta başlık"), field("metaDescription", "Meta açıklama", "textarea"), field("canonicalPath", "Kanonik yol")] }),
  definition({ kind: "seo_product_entry", family: "seo", route: "/seo/products", title: "Ürün SEO", singular: "ürün SEO kaydı", description: "Ürün kaynaklarının meta ve kanonik yol tercihlerini yönetin.", fields: [field("resourceId", "Kaynak kimliği"), field("metaTitle", "Meta başlık"), field("metaDescription", "Meta açıklama", "textarea"), field("canonicalPath", "Kanonik yol")] }),
  definition({ kind: "ai_setting", family: "settings", route: "/settings/artificial-intelligence", title: "Yapay Zeka", singular: "yapay zeka tercihi", description: "Yapay zeka önerileri için güvenli dil, ton ve özellik tercihlerini yönetin.", notice: "Harici sağlayıcı etkinleştirilmeden öneri üretimi kullanılamaz.", fields: [field("tone", "Ton"), field("locale", "Dil", "text", "tr-TR"), field("enabledFeatures", "Etkin öneriler", "string-list", "Her satıra bir özellik")] }),
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

function configured(value: MerchantAdminJson | undefined): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value.length > 0 && value === value.trim();
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0;
  if (Array.isArray(value)) return value.length > 0 && value.every((entry) => typeof entry === "string" && entry.length > 0 && entry === entry.trim());
  return false;
}

export function buildProviderWorkflowState(
  definition: MerchantModuleDefinition,
  record: MerchantAdminRecord,
) {
  if (!definition.workflow) return null;
  const missingFields = Object.freeze(definition.workflow.requiredFields.flatMap((key) => {
    if (configured(record.config[key])) return [];
    return [definition.fields.find((fieldDefinition) => fieldDefinition.key === key)?.label ?? key];
  }));
  if (record.status === "archived") return Object.freeze({ code: "archived" as const, label: "Arşivlendi", canPrepare: false, missingFields });
  if (missingFields.length) return Object.freeze({ code: "configuration_incomplete" as const, label: "Yapılandırma eksik", canPrepare: false, missingFields });
  if (record.status === "draft") return Object.freeze({ code: "configuration_ready" as const, label: "Yapılandırma hazır", canPrepare: false, missingFields });
  return Object.freeze({ code: "awaiting_preparation" as const, label: "Hazırlık oluşturulabilir", canPrepare: true, missingFields });
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
    const rawValue = config[entry.key]!;
    const value = entry.type === "enum" && typeof rawValue === "string"
      ? entry.optionLabels?.[rawValue] ?? rawValue
      : displayValue(rawValue);
    return value === null ? [] : [Object.freeze({ label: entry.label, value })];
  }));
}
