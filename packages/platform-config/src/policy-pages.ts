export type SupportedPolicyLocale = "tr" | "en" | "de" | "ru" | "ar" | "ka";

export type PolicyPageSlug =
  | "mesafeli-satis-sozlesmesi"
  | "iade"
  | "gizlilik"
  | "kvkk";

export interface PolicyPageDefinition {
  slug: PolicyPageSlug;
  name: string;
  description: string;
  schemaType: string;
  icon: string;
  sortOrder: number;
  labels: Record<SupportedPolicyLocale, string>;
}

export const POLICY_PAGE_DEFINITIONS: readonly PolicyPageDefinition[] = [
  {
    slug: "mesafeli-satis-sozlesmesi",
    name: "Mesafeli Satış Sözleşmesi",
    description: "Mağazanın mesafeli satış şartlarını müşteriye sunan ana hukuk metni.",
    schemaType: "WebPage",
    icon: "Scale",
    sortOrder: 90,
    labels: {
      tr: "Mesafeli Satış Sözleşmesi",
      en: "Distance Sales Agreement",
      de: "Fernabsatzvertrag",
      ru: "Договор дистанционной продажи",
      ar: "اتفاقية البيع عن بعد",
      ka: "დისტანციური გაყიდვის შეთანხმება",
    },
  },
  {
    slug: "iade",
    name: "Teslimat ve İade Politikası",
    description: "Teslimat, iade ve değişim koşullarını açıklayan politika sayfası.",
    schemaType: "WebPage",
    icon: "RotateCcw",
    sortOrder: 91,
    labels: {
      tr: "Teslimat ve İade Politikası",
      en: "Delivery and Returns",
      de: "Lieferung und Rückgabe",
      ru: "Доставка и возврат",
      ar: "الشحن والاسترجاع",
      ka: "მიწოდება და დაბრუნება",
    },
  },
  {
    slug: "gizlilik",
    name: "Gizlilik Politikası",
    description: "Veri toplama, işleme ve iletişim süreçlerine dair gizlilik açıklaması.",
    schemaType: "WebPage",
    icon: "ShieldCheck",
    sortOrder: 92,
    labels: {
      tr: "Gizlilik Politikası",
      en: "Privacy Policy",
      de: "Datenschutz",
      ru: "Политика конфиденциальности",
      ar: "سياسة الخصوصية",
      ka: "კონფიდენციალურობის პოლიტიკა",
    },
  },
  {
    slug: "kvkk",
    name: "KVKK",
    description: "Kişisel verilerin korunmasına dair aydınlatma ve başvuru metni.",
    schemaType: "WebPage",
    icon: "Shield",
    sortOrder: 93,
    labels: {
      tr: "KVKK",
      en: "Data Privacy",
      de: "Datenschutzrecht",
      ru: "Защита данных",
      ar: "خصوصية البيانات",
      ka: "მონაცემთა დაცვა",
    },
  },
] as const;

const POLICY_PAGE_MAP = new Map<PolicyPageSlug, PolicyPageDefinition>(
  POLICY_PAGE_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export function isPolicyPageSlug(value: string): value is PolicyPageSlug {
  return POLICY_PAGE_MAP.has(value as PolicyPageSlug);
}

export function getPolicyPageDefinition(slug: string): PolicyPageDefinition | null {
  if (!isPolicyPageSlug(slug)) {
    return null;
  }

  return POLICY_PAGE_MAP.get(slug) ?? null;
}

export function getPolicyPageLabel(
  slug: PolicyPageSlug,
  locale: SupportedPolicyLocale,
): string {
  return POLICY_PAGE_MAP.get(slug)?.labels[locale] ?? POLICY_PAGE_MAP.get(slug)?.name ?? slug;
}
