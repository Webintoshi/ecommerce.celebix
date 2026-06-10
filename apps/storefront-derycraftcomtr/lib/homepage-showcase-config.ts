export const HOMEPAGE_CATEGORY_ORDER = [
  { slug: "cuzdan-kartlik", name: "Cüzdan & Kartlık" },
  { slug: "apple-watch-saat-kayislari", name: "Apple Watch Kayışları" },
  { slug: "saat-kayislari", name: "Deri Saat Kayışları" },
  { slug: "canta-organizer", name: "Çanta & Organizer" },
  { slug: "aksesuar", name: "Aksesuar" },
  { slug: "gunluk-yasam", name: "Günlük Yaşam" },
] as const;

export const HOMEPAGE_CATEGORY_SLUGS = HOMEPAGE_CATEGORY_ORDER.map((entry) => entry.slug);

export const HOMEPAGE_SHOWCASE_CATEGORY_SLUGS = [
  "cuzdan-kartlik",
  "apple-watch-saat-kayislari",
  "aksesuar",
  "saat-kayislari",
] as const;
