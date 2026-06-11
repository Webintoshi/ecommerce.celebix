export type GiftRecipient =
  | "annem"
  | "babam"
  | "esim"
  | "sevgilim"
  | "arkadasim"
  | "is-arkadasim"
  | "kendim";

export type GiftOccasion =
  | "icimden-geldi"
  | "dogum-gunu"
  | "yil-donumu"
  | "babalar-gunu"
  | "anneler-gunu"
  | "sevgililer-gunu"
  | "yeni-is"
  | "yeni-yil";

export type GiftBudget = "" | "1000" | "2500" | "5000" | "10000";

export type GiftFinderFilters = {
  recipient: GiftRecipient | "";
  budget: GiftBudget;
  occasion: GiftOccasion;
};

export const GIFT_RECIPIENT_OPTIONS: Array<{ value: GiftRecipient | ""; label: string }> = [
  { value: "", label: "Seçiniz" },
  { value: "annem", label: "Annem" },
  { value: "babam", label: "Babam" },
  { value: "esim", label: "Eşim" },
  { value: "sevgilim", label: "Sevgilim" },
  { value: "arkadasim", label: "Arkadaşım" },
  { value: "is-arkadasim", label: "İş arkadaşım" },
  { value: "kendim", label: "Kendim" },
];

export const GIFT_BUDGET_OPTIONS: Array<{ value: GiftBudget; label: string }> = [
  { value: "1000", label: "1.000 TL'ye kadar" },
  { value: "2500", label: "2.500 TL'ye kadar" },
  { value: "5000", label: "5.000 TL'ye kadar" },
  { value: "10000", label: "10.000 TL'ye kadar" },
  { value: "", label: "Bütçe fark etmez" },
];

export const GIFT_OCCASION_OPTIONS: Array<{ value: GiftOccasion; label: string }> = [
  { value: "icimden-geldi", label: "İçimden geldi" },
  { value: "dogum-gunu", label: "Doğum günü" },
  { value: "yil-donumu", label: "Evlilik yıl dönümü" },
  { value: "babalar-gunu", label: "Babalar günü" },
  { value: "anneler-gunu", label: "Anneler günü" },
  { value: "sevgililer-gunu", label: "Sevgililer günü" },
  { value: "yeni-is", label: "Yeni iş / terfi" },
  { value: "yeni-yil", label: "Yeni yıl" },
];

export const GIFT_CATEGORY_LABELS: Record<string, string> = {
  "cuzdan-kartlik": "Cüzdan & Kartlık",
  "apple-watch-saat-kayislari": "Apple Watch Kayışları",
  "saat-kayislari": "Deri Saat Kayışları",
  "canta-organizer": "Çanta & Organizer",
  aksesuar: "Aksesuar",
  "gunluk-yasam": "Günlük Yaşam",
};

export const RECIPIENT_CATEGORY_BOOST: Record<GiftRecipient, string[]> = {
  annem: ["aksesuar", "gunluk-yasam", "canta-organizer"],
  babam: ["cuzdan-kartlik", "saat-kayislari"],
  esim: ["apple-watch-saat-kayislari", "cuzdan-kartlik", "aksesuar"],
  sevgilim: ["apple-watch-saat-kayislari", "aksesuar", "cuzdan-kartlik"],
  arkadasim: ["cuzdan-kartlik", "aksesuar", "gunluk-yasam"],
  "is-arkadasim": ["cuzdan-kartlik", "saat-kayislari", "aksesuar"],
  kendim: ["gunluk-yasam", "apple-watch-saat-kayislari", "cuzdan-kartlik"],
};

export const OCCASION_CATEGORY_BOOST: Record<GiftOccasion, string[]> = {
  "icimden-geldi": ["cuzdan-kartlik", "aksesuar"],
  "dogum-gunu": ["cuzdan-kartlik", "aksesuar"],
  "yil-donumu": ["apple-watch-saat-kayislari", "canta-organizer"],
  "babalar-gunu": ["cuzdan-kartlik", "saat-kayislari"],
  "anneler-gunu": ["canta-organizer", "gunluk-yasam", "aksesuar"],
  "sevgililer-gunu": ["apple-watch-saat-kayislari", "aksesuar"],
  "yeni-is": ["cuzdan-kartlik", "canta-organizer"],
  "yeni-yil": ["aksesuar", "cuzdan-kartlik"],
};

export const DEFAULT_GIFT_FINDER_FILTERS: GiftFinderFilters = {
  recipient: "",
  budget: "2500",
  occasion: "icimden-geldi",
};

export const GIFT_FINDER_HERO_IMAGE = "/gift-finder-hero.png";

/** Small static asset for header icon — avoids remote transform/proxy failures. */
export const GIFT_FINDER_HEADER_ICON = "/gift-finder-header-icon.png";
