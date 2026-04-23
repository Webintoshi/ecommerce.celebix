export type ManagedContentPageSlug = "hakkimizda" | "iletisim" | "sss";

export interface ManagedContentPageDefinition {
  slug: ManagedContentPageSlug;
  name: string;
  description: string;
  schemaType: string;
  icon: string;
  sortOrder: number;
}

export const MANAGED_CONTENT_PAGE_DEFINITIONS: readonly ManagedContentPageDefinition[] = [
  {
    slug: "hakkimizda",
    name: "Hakkimizda",
    description: "Marka hikayesi, kurumsal anlatim ve magazaya dair ana icerik sayfasi.",
    schemaType: "AboutPage",
    icon: "Info",
    sortOrder: 4,
  },
  {
    slug: "iletisim",
    name: "Iletisim",
    description: "Iletisim metni, destek detaylari ve magaza ile baglanti kanallari.",
    schemaType: "ContactPage",
    icon: "Mail",
    sortOrder: 3,
  },
  {
    slug: "sss",
    name: "SSS",
    description: "Sikca sorulan sorular ve operasyonel aciklamalar icin yardim sayfasi.",
    schemaType: "FAQPage",
    icon: "HelpCircle",
    sortOrder: 5,
  },
] as const;

const MANAGED_CONTENT_PAGE_MAP = new Map<ManagedContentPageSlug, ManagedContentPageDefinition>(
  MANAGED_CONTENT_PAGE_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export function isManagedContentPageSlug(value: string): value is ManagedContentPageSlug {
  return MANAGED_CONTENT_PAGE_MAP.has(value as ManagedContentPageSlug);
}

export function getManagedContentPageDefinition(
  slug: string,
): ManagedContentPageDefinition | null {
  if (!isManagedContentPageSlug(slug)) {
    return null;
  }

  return MANAGED_CONTENT_PAGE_MAP.get(slug) ?? null;
}
