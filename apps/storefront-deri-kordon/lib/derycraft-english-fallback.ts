import type { StorefrontLocale } from "@/lib/i18n";

type VariantAttribute = Record<string, unknown>;

type VariantRecord = {
  name?: string | null;
  group_name?: string | null;
  groupName?: string | null;
  attributes?: VariantAttribute[] | null;
  raw_attributes?: VariantAttribute[] | null;
};

type ProductRecord = {
  name?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  short_description?: string | null;
  seoTitle?: string | null;
  seo_title?: string | null;
  seoDescription?: string | null;
  seo_description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  variants?: VariantRecord[] | null;
  images_v2?: Array<{ alt?: string | null } | string> | null;
};

type CustomizationOptionRecord = {
  label?: string | null;
  value?: string | null;
  description?: string | null;
};

type CustomizationStepRecord = {
  label?: string | null;
  placeholder?: string | null;
  help_text?: string | null;
  options?: CustomizationOptionRecord[] | null;
};

type CustomizationSettingsRecord = {
  submit_button_text?: string | null;
  success_message?: string | null;
};

type CustomizationSchemaRecord = {
  name?: string | null;
  description?: string | null;
  settings?: CustomizationSettingsRecord | null;
  steps?: CustomizationStepRecord[] | null;
};

type ProductFamily = "wallet" | "apple-watch-band" | "watch-strap" | "bag" | "accessory" | "general";

const EXACT_TEXT_TRANSLATIONS: Array<[string, string]> = [
  ["ÇANTA & ORGANİZER", "Bags & Organizers"],
  ["APPLE WATCH KAYIŞLARI", "Apple Watch Bands"],
  ["CÜZDAN & KARTLIK", "Wallets & Cardholders"],
  ["AKSESUAR", "Accessories"],
  ["SAAT KAYIŞLARI", "Watch Straps"],
  ["Cuzdan & Kartlik", "Wallets & Cardholders"],
  ["Ürün sepete eklendi", "Product added to cart"],
  ["Sepete Ekle", "Add to Cart"],
  ["KİŞİSELLEŞTİRME İSTİYOR MUSUNUZ ?", "Would you like personalization?"],
  ["HAYIR", "No"],
  ["LAZER KAZIMA", "Laser Engraving"],
  ["HARF BASKI", "Initial Stamping"],
  ["BASKI TÜRÜ", "Stamping Style"],
  ["Altın Yaldızlı", "Gold Foil"],
  ["Düz Baskı", "Plain Stamp"],
  ["YAZI EKLE", "Add Text"],
  ["PAKET SEÇİN", "Choose Packaging"],
  ["Kese", "Pouch"],
  ["Paket", "Gift Wrap"],
  ["Kutu", "Box"],
  ["KİŞİSEL BİLGİLERİMİ KONTROL ETTİM.", "I have checked my personalization details."],
  ["Renk", "Color"],
  ["Adet", "Piece"],
  ["Standart", "Standard"],
  ["Çıtçıtlı Deri Kartlık", "Snap Leather Cardholder"],
  ["Mini Dikey Kartlık (Paragon Mini)", "Paragon Mini Vertical Cardholder"],
  ["Minimalist Deri Kartlık (Chronos)", "Chronos Minimalist Leather Cardholder"],
  ["Nakit Bölmeli Dikey Deri Cüzdan", "Vertical Leather Wallet with Cash Compartment"],
  ["Klasik Deri Cüzdan", "Classic Leather Wallet"],
  ["İç Cepli Klasik Deri Cüzdan", "Classic Leather Wallet with Inner Pocket"],
  ["Dikey Deri Kartlık (Paragon Midi)", "Paragon Midi Vertical Leather Cardholder"],
  ["Katlanır Deri Cüzdan", "Folded Leather Wallet"],
  ["Deri Telefon Cüzdanı (Zen)", "Zen Leather Phone Wallet"],
  ["Deri Pasaport Cüzdanı", "Leather Passport Wallet"],
  ["Deri Pasaport Kılıfı", "Leather Passport Cover"],
  ["Fermuarlı Uzun Deri Cüzdan (Flora)", "Flora Zippered Long Leather Wallet"],
  ["Telefon Bölmeli Uzun Cüzdan (Elara)", "Elara Long Leather Wallet with Phone Compartment"],
  ["Deri Tek Kartlık", "Single Leather Cardholder"],
  ["Minimalist Deri Cüzdan (Colt)", "Colt Minimalist Leather Wallet"],
  ["Çapraz Deri Göğüs Çantası (Atlas)", "Atlas Crossbody Leather Chest Bag"],
  ["Deri El Çantası (Grace)", "Grace Leather Handbag"],
  ["Deri Evrak Çantası (Expand)", "Expand Leather Briefcase"],
  ["Deri Evrak Çantası (Slim)", "Slim Leather Briefcase"],
  ["Deri Omuz Çantası (Grace XL)", "Grace XL Leather Shoulder Bag"],
  ["Deri Omuz Çantası (Soho)", "Soho Leather Shoulder Bag"],
  ["Deri Postacı Çantası (Edith)", "Edith Leather Messenger Bag"],
  ["Deri Telefon Çantası (Nova)", "Nova Leather Phone Bag"],
  ["Deri Telefon Çantası (Skye)", "Skye Leather Phone Bag"],
  ["Deri Tote Çanta Küçük (Vera)", "Vera Small Leather Tote Bag"],
  ["Dopp Kit Deri El Çantası (Vega)", "Vega Leather Dopp Kit"],
  ["Dopp Kit Deri Makyaj Çantası (Lotus)", "Lotus Leather Dopp Kit Makeup Bag"],
  ["Çıtçıtlı Deri Çakı Kılıfı", "Snap Leather Pocketknife Sheath"],
  ["Çıtçıtlı Deri Kalemlik", "Snap Leather Pen Sleeve"],
  ["Deri Airpods Kılıfı", "Leather AirPods Case"],
  ["Deri Airtag Kılıfı", "Leather AirTag Case"],
  ["Deri Anahtar Kesesi Maxi", "Leather Key Pouch Maxi"],
  ["Deri Anahtar Kesesi Midi", "Leather Key Pouch Midi"],
  ["Deri Anahtar Kesesi Mini", "Leather Key Pouch Mini"],
  ["Deri Anahtarlık Keyfolder", "Leather Key Organizer"],
  ["Deri Bardak Altlığı", "Leather Coaster"],
  ["Deri Gözlük Kılıfı", "Leather Glasses Case"],
  ["Deri Gözlük Kutusu", "Leather Glasses Box"],
  ["Deri Kablo Toplayıcı", "Leather Cable Organizer"],
  ["Deri Kalem Kutusu", "Leather Pen Case"],
  ["Deri Kılıflı Çakmak (Armor) Tam Kapalı", "Leather Lighter Case (Armor) Fully Covered"],
  ["Deri Kılıflı Çakmak (Belt) Kemer Askılı", "Leather Lighter Case (Belt) Belt Loop"],
  ["Deri Kılıflı Çakmak (Clip) – Anahtarlık Askılı", "Leather Lighter Case (Clip) Keyring Loop"],
  ["Deri Ruj Kutusu", "Leather Lipstick Case"],
  ["Deri Rulo Anahtarlık", "Leather Roll Key Holder"],
  ["Deri Rulo Kalemlik", "Leather Roll Pen Case"],
  ["Deri Saat Kesesi", "Leather Watch Pouch"],
  ["Deri Tepsi", "Leather Tray"],
  ["Deri Tütün Kesesi", "Leather Tobacco Pouch"],
  ["DeryCraft Deri Bakım Kremi", "DeryCraft Leather Care Cream"],
  ["Klasik Deri Anahtarlık", "Classic Leather Key Holder"],
];

const COLOR_TRANSLATIONS = new Map<string, string>([
  ["aci kahve", "Dark Brown"],
  ["antrasit", "Anthracite"],
  ["asker yesili", "Army Green"],
  ["asfalt", "Asphalt"],
  ["bej", "Beige"],
  ["camel", "Camel"],
  ["cat", "Tan"],
  ["gri", "Gray"],
  ["kahve", "Brown"],
  ["kirmizi", "Red"],
  ["kizil crazy", "Red Crazy"],
  ["mavi", "Blue"],
  ["murdum", "Plum"],
  ["orange", "Orange"],
  ["oranj", "Orange"],
  ["saffiano kahve", "Saffiano Brown"],
  ["siyah", "Black"],
  ["taba", "Tan"],
  ["tobacco", "Tobacco"],
  ["yesil", "Green"],
]);

const COMMON_TEXT_REPLACEMENTS: Array<[string, string]> = [
  ["Özellikler:", "Features:"],
  ["Malzeme:", "Material:"],
  ["Üretim ve İşçilik:", "Production & Craftsmanship:"],
  ["Üretim ve İşçilik: ", "Production & Craftsmanship: "],
  ["Kapama:", "Closure:"],
  ["Kapalı Boyut:", "Closed Size:"],
  ["Açık Boyut:", "Open Size:"],
  ["Kart Kapasitesi:", "Card Capacity:"],
  ["Ek Özellik:", "Additional Feature:"],
  ["Kalınlık:", "Thickness:"],
  ["Adaptör ve Toka :", "Adapters & Buckle:"],
  ["Adaptör ve Toka:", "Adapters & Buckle:"],
  ["Uyumluluk:", "Compatibility:"],
  ["Beden:", "Size:"],
  ["Özel Tabaklama İşlemi ve Deri Bakımı:", "Special Tanning Process & Leather Care:"],
  ["Ürünlerinizi özel bakım ürünleri kullanarak canlandırabilir ve ilk günkü parlaklığını koruyabilirsiniz.", "You can refresh your piece with dedicated leather care products and preserve its original finish."],
  ["Ürünlerinizi özel bakım ürünlerini kullanarak canlandırabilir ve ilk günkü parlaklığını çoğaltabilirsiniz.", "You can refresh your piece with dedicated leather care products and maintain its original look."],
  ["Ancak, suyla temas ettirmemeye özen göstermeli ve herhangi bir kimyasal maddeyle temizlenmemelidir.", "Avoid prolonged contact with water and do not clean it with chemical products."],
  ["Bu basit önlemler, ürünlerinizin ömrünü arttıracak ve yıllar boyunca size eşlik edecek bir şıklık sunacaktır.", "These simple precautions help extend the life of your piece and keep its elegance with you for years."],
  ["Dikkat: Kişiselleştirilmiş ürünlerin iadesi, “İptal ve İade Politikamız”da belirtildiği üzere kabul edilmemektedir.", "Attention: Personalized items are non-returnable as stated in our Cancellation & Return Policy."],
  ["Dikkat: Kişiselleştirilmiş ürünlerin iadesi, “ İptal ve İade Politikamız ”da belirtildiği üzere kabul edilmemektedir.", "Attention: Personalized items are non-returnable as stated in our Cancellation & Return Policy."],
  ["Dikkat : Kişiselleştirilmiş ürünlerin iadesi, “ İptal ve İade Politikamız ”da belirtildiği üzere kabul edilmemektedir.", "Attention: Personalized items are non-returnable as stated in our Cancellation & Return Policy."],
  ["Not : Ürün tamamen el yapımı olduğu için görselden ufak farklılıklar içerebilir.", "Note: Because each piece is handmade, slight visual differences from the photos may occur."],
  ["Not: Ürün tamamen el yapımı olduğu için görselden ufak farklılıklar içerebilir.", "Note: Because each piece is handmade, slight visual differences from the photos may occur."],
  ["Not : Ürün tamamen el yapımı olduğu için görsellerden ufak farklılıklar içerebilir.", "Note: Because each piece is handmade, slight visual differences from the photos may occur."],
  ["Whatsapp iletişim:", "WhatsApp contact:"],
  ["Whatsapp iletişim", "WhatsApp contact"],
  ["Lütfen Apple Watch’unuzun iç kısmında yazan kasa boyutuna göre mm tercihi yapınız.", "Please choose the mm size according to the case size written on the inside of your Apple Watch."],
  ["Lütfen saatinizin boynuz ve toka boyutuna göre mm tercihi yapınız.", "Please choose the mm size according to your watch lug and buckle width."],
  ["Ayrıca, görsellerde kullanılan saat fiyata dahil değildir.", "The watch shown in the visuals is not included."],
  ["Ayrıca, görsellerde kullanılan Apple Watch fiyata dahil değildir.", "The Apple Watch shown in the visuals is not included."],
  ["Paslanmaz çelik adaptör ve tokaları sayesinde güvenli kullanım sağlar.", "Stainless-steel adapters and buckles provide a secure fit."],
  ["Paslanmaz çelik adaptör ve tokalar, saatinize zarif bir dokunuş ekler ve güvenli kullanım sağlar.", "Stainless-steel adapters and buckles add a refined touch while keeping the fit secure."],
  ["Tek kat, astarsız yapısıyla hafif ve esnek bir kullanım sağlar.", "Its single-layer unlined build keeps the feel light and flexible."],
  ["Mumlu ip ile el dikişi yapılan deri saat kordonları, uzun ömürlü ve dayanıklı bir kullanım sunar.", "Hand-stitched with waxed thread, these leather watch straps are made for long-term durability."],
  ["Mumlu ip ile el dikişi yapılan bu deri saat kordonları, dayanıklılığı ve konforu bir araya getirir.", "Hand-stitched with waxed thread, these leather watch straps balance durability and comfort."],
  ["Apple saat kordonu olarak tasarlanan bu ürün, tüm Apple Watch modelleriyle uyumlu olup, bileğinizde zarif ve şık bir duruş sergiler.", "Designed as a leather Apple Watch band, this piece is compatible with Apple Watch models and delivers a refined look on the wrist."],
  ["Saatinize özel bir dokunuş katmak ve uzun yıllar kullanabileceğiniz kaliteli bir kordon arıyorsanız, bu tek kat deri saat kayışı tam size göre!", "If you want a quality strap that adds a distinctive touch to your watch and wears beautifully for years, this single-layer leather watch strap is a strong fit."],
  ["Saatinize özel bir dokunuş katmak ve uzun yıllar kullanabileceğiniz kaliteli bir kordon arıyorsanız, bu çift kat deri saat kayışı tam size göre!", "If you want a quality strap that adds a distinctive touch to your watch and wears beautifully for years, this double-layer leather watch strap is a strong fit."],
  ["Hem klasik hem de modern kombinler için ideal bir seçimdir.", "It is an ideal choice for both classic and modern looks."],
  ["Hem klasik hem de modern tarzlar için ideal bir seçimdir.", "It is an ideal choice for both classic and modern looks."],
  ["Bu da her ürünün benzersiz ve özel olmasını sağlar.", "That is part of what makes each piece unique."],
  ["Bu basit adımlar, çantanızın ömrünü uzatmaya yardımcı olacaktır.", "These simple steps help extend the life of your bag."],
  ["Kaliteli malzemelerle yapılan bu deri el çantası, uzun yıllar size eşlik edecek dayanıklılığa sahiptir.", "Crafted with premium materials, this leather handbag is built to accompany you for years."],
  ["Düzenli kullanımda derinin nem dengesini korur, çizikleri giderir, çatlamasını önler ve deriye doğal bir parlaklık kazandırır.", "With regular use it helps preserve moisture balance, reduce surface marks, prevent cracking and restore the leather's natural sheen."],
  ["Doğrudan güneşe ve suya maruz bırakmamaya özen gösterin.", "Avoid direct sun exposure and prolonged contact with water."],
  ["Özellikle %100 doğal malzemelerden geliştirdiğimiz DeryCraft Deri Bakım Kremi bu konuda idealdir.", "Our DeryCraft Leather Care Cream, developed with 100% natural ingredients, is ideal for this purpose."],
];

const EXACT_TEXT_MAP = new Map(
  EXACT_TEXT_TRANSLATIONS.map(([source, target]) => [normalizeText(source), target]),
);

const TEXT_REPLACEMENTS = [
  ...[...EXACT_TEXT_TRANSLATIONS].sort((left, right) => right[0].length - left[0].length),
  ...COMMON_TEXT_REPLACEMENTS,
];

const TURKISH_MARKERS = [
  "deri",
  "kayisi",
  "kayis",
  "cuzdan",
  "kartlik",
  "canta",
  "aksesuar",
  "kisisellest",
  "ozellik",
  "malzeme",
  "uretim",
  "iscilik",
  "hakiki",
  "el yapimi",
  "saatinize",
  "saat",
  "urun",
  "bakim",
  "dikkat",
  "renk",
];

function normalizeText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplayText(value: string) {
  return value.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function applyExactTextTranslation(value: string) {
  return EXACT_TEXT_MAP.get(normalizeText(value)) || null;
}

function translateColorValue(value: string) {
  return COLOR_TRANSLATIONS.get(normalizeText(value)) || null;
}

function translateWatchTitle(value: string) {
  const source = normalizeDisplayText(value);
  const patterns: Array<{
    pattern: RegExp;
    render: (color: string, layer: string) => string;
  }> = [
    {
      pattern: /^Bund (Tek Katlı|Çift Katlı) Apple Watch Deri Kayış(?:ı)?\s*(?:-\s*|\s+)(.+)$/u,
      render: (color, layer) => `${translateLayer(layer)} Leather Apple Watch Band - ${translateColorLabel(color)}`,
    },
    {
      pattern: /^Bund (Tek Katlı|Çift Katlı) Deri(?: Saat)? Kayış(?:ı)?\s*(?:-\s*|\s+)(.+)$/u,
      render: (color, layer) => `${translateLayer(layer)} Leather Bund Watch Strap - ${translateColorLabel(color)}`,
    },
    {
      pattern: /^(Tek Katlı|Çift Katlı) Deri Apple Watch Kayışı\s*(?:-\s*|\s+)(.+)$/u,
      render: (color, layer) => `${translateLayer(layer)} Leather Apple Watch Band - ${translateColorLabel(color)}`,
    },
    {
      pattern: /^(Tek Katlı|Çift Katlı) Deri Saat Kayışı\s*(?:-\s*|\s+)(.+)$/u,
      render: (color, layer) => `${translateLayer(layer)} Leather Watch Strap - ${translateColorLabel(color)}`,
    },
  ];

  for (const { pattern, render } of patterns) {
    const match = source.match(pattern);
    if (match) {
      return render(match[2] || "", match[1] || "");
    }
  }

  return null;
}

function translateLayer(value: string) {
  return normalizeText(value).includes("cift katli") ? "Double Layer" : "Single Layer";
}

function translateColorLabel(value: string) {
  return translateColorValue(value) || normalizeDisplayText(value);
}

function replaceAllPairs(value: string, pairs: Array<[string, string]>) {
  let result = value;

  for (const [source, target] of pairs) {
    if (!source || source === target || !result.includes(source)) {
      continue;
    }

    result = result.split(source).join(target);
  }

  return result;
}

function countTurkishMarkers(value: string) {
  const normalized = normalizeText(stripHtml(value));
  return TURKISH_MARKERS.reduce(
    (count, marker) => (normalized.includes(marker) ? count + 1 : count),
    0,
  );
}

function looksTurkish(value: string) {
  return countTurkishMarkers(value) >= 2;
}

function resolveProductFamily(product: ProductRecord) {
  const category = normalizeText(product.category || "");
  const subcategory = normalizeText(product.subcategory || "");
  const name = normalizeText(product.name || "");
  const haystack = [category, subcategory, name].join(" ");

  if (haystack.includes("apple-watch")) {
    return "apple-watch-band";
  }

  if (haystack.includes("saat-kayislari") || haystack.includes("saat kayisi")) {
    return "watch-strap";
  }

  if (haystack.includes("cuzdan-kartlik") || haystack.includes("cuzdan") || haystack.includes("kartlik")) {
    return "wallet";
  }

  if (haystack.includes("canta-organizer") || haystack.includes("canta") || haystack.includes("organizer")) {
    return "bag";
  }

  if (haystack.includes("aksesuar") || haystack.includes("airpods") || haystack.includes("airtag")) {
    return "accessory";
  }

  return "general";
}

function buildShortDescription(name: string, family: ProductFamily) {
  switch (family) {
    case "apple-watch-band":
      return `${name} is a handmade full-grain leather Apple Watch band designed for daily comfort and a refined finish.`;
    case "watch-strap":
      return `${name} is a handmade full-grain leather watch strap with a clean, durable finish for everyday wear.`;
    case "wallet":
      return `${name} combines full-grain leather, practical organization and a compact handmade silhouette for everyday carry.`;
    case "bag":
      return `${name} brings together premium leather, functional storage and a polished everyday look.`;
    case "accessory":
      return `${name} is a handmade leather accessory designed to add order, protection and everyday ease.`;
    default:
      return `${name} is a handmade full-grain leather piece crafted for lasting daily use.`;
  }
}

function buildSeoDescription(name: string, family: ProductFamily) {
  switch (family) {
    case "apple-watch-band":
      return `${name} by DeryCraft pairs full-grain leather, handmade finishing and Apple Watch compatibility in a refined everyday band.`;
    case "watch-strap":
      return `${name} by DeryCraft delivers a handmade full-grain leather watch strap with premium comfort and a durable finish.`;
    case "wallet":
      return `${name} by DeryCraft offers full-grain leather, handmade quality and practical everyday organization in one refined wallet.`;
    case "bag":
      return `${name} by DeryCraft combines premium leather, handmade detailing and elegant everyday function.`;
    case "accessory":
      return `${name} by DeryCraft is a premium leather accessory with handmade craftsmanship and practical daily use.`;
    default:
      return `${name} by DeryCraft is a handmade leather design crafted with premium materials and a refined finish.`;
  }
}

function buildDescriptionHtml(name: string, family: ProductFamily) {
  switch (family) {
    case "apple-watch-band":
      return [
        `<p>${name} is a workshop-made full-grain leather Apple Watch band created for refined daily wear.</p>`,
        "<ul>",
        "<li><strong>Material:</strong> Full-grain genuine leather</li>",
        "<li><strong>Craftsmanship:</strong> Handmade and hand-stitched in the workshop</li>",
        "<li><strong>Hardware:</strong> Secure metal adapters and buckle</li>",
        "<li><strong>Fit:</strong> Please choose the mm size according to the case size written inside your Apple Watch</li>",
        "</ul>",
        "<p>The leather develops a richer patina with use and becomes more personal over time.</p>",
        "<p>Use dedicated leather care products when needed, avoid prolonged contact with water and do not clean with harsh chemicals.</p>",
        "<p><strong>Note:</strong> Because each piece is handmade, slight visual differences from the photos may occur.</p>",
        "<p><strong>Attention:</strong> Personalized items are non-returnable.</p>",
      ].join("");
    case "watch-strap":
      return [
        `<p>${name} is a workshop-made full-grain leather watch strap designed for comfort, durability and a tailored wrist presence.</p>`,
        "<ul>",
        "<li><strong>Material:</strong> Full-grain genuine leather</li>",
        "<li><strong>Craftsmanship:</strong> Handmade and hand-stitched in the workshop</li>",
        "<li><strong>Hardware:</strong> Secure buckle construction</li>",
        "<li><strong>Fit:</strong> Please choose the mm size according to your watch lug and buckle width</li>",
        "</ul>",
        "<p>The leather gains character with use while maintaining a clean premium finish.</p>",
        "<p>Use dedicated leather care products when needed, avoid prolonged contact with water and do not clean with harsh chemicals.</p>",
        "<p><strong>Note:</strong> Because each piece is handmade, slight visual differences from the photos may occur.</p>",
        "<p><strong>Attention:</strong> Personalized items are non-returnable.</p>",
      ].join("");
    case "wallet":
      return [
        `<p>${name} brings together full-grain leather, practical organization and a refined handmade finish for everyday carry.</p>`,
        "<ul>",
        "<li><strong>Material:</strong> Full-grain genuine leather</li>",
        "<li><strong>Craftsmanship:</strong> Handmade and hand-stitched in the workshop</li>",
        "<li><strong>Use:</strong> Built for cards, cash and compact daily essentials</li>",
        "</ul>",
        "<p>The leather develops a richer patina with use and becomes more distinctive over time.</p>",
        "<p>Use dedicated leather care products when needed, avoid prolonged contact with water and do not clean with harsh chemicals.</p>",
        "<p><strong>Note:</strong> Because each piece is handmade, slight visual differences from the photos may occur.</p>",
        "<p><strong>Attention:</strong> Personalized items are non-returnable.</p>",
      ].join("");
    case "bag":
      return [
        `<p>${name} combines premium leather, considered storage and a polished handmade silhouette for daily use.</p>`,
        "<ul>",
        "<li><strong>Material:</strong> Full-grain genuine leather</li>",
        "<li><strong>Craftsmanship:</strong> Handmade construction with refined finishing</li>",
        "<li><strong>Use:</strong> Designed to carry daily essentials with a premium feel</li>",
        "</ul>",
        "<p>The leather will soften and develop a deeper patina as it is used.</p>",
        "<p>Use dedicated leather care products when needed, avoid prolonged contact with water and do not clean with harsh chemicals.</p>",
        "<p><strong>Note:</strong> Because each piece is handmade, slight visual differences from the photos may occur.</p>",
      ].join("");
    case "accessory":
      return [
        `<p>${name} is a handmade leather accessory built to bring protection, order and a premium finish to daily routines.</p>`,
        "<ul>",
        "<li><strong>Material:</strong> Full-grain genuine leather</li>",
        "<li><strong>Craftsmanship:</strong> Handmade in the workshop</li>",
        "<li><strong>Use:</strong> Practical everyday support with long-wear durability</li>",
        "</ul>",
        "<p>The leather develops more character over time and rewards regular care.</p>",
        "<p>Use dedicated leather care products when needed, avoid prolonged contact with water and do not clean with harsh chemicals.</p>",
        "<p><strong>Note:</strong> Because each piece is handmade, slight visual differences from the photos may occur.</p>",
      ].join("");
    default:
      return [
        `<p>${name} is a handmade DeryCraft leather piece created with premium materials and a refined workshop finish.</p>`,
        "<p>The leather develops a richer patina with use while maintaining a durable everyday character.</p>",
        "<p>Use dedicated leather care products when needed, avoid prolonged contact with water and do not clean with harsh chemicals.</p>",
      ].join("");
  }
}

function translateVariantAttribute(attribute: VariantAttribute) {
  const translatedName = applyDerycraftEnglishTextFallback(
    typeof attribute.name === "string" ? attribute.name : typeof attribute.attributeName === "string" ? attribute.attributeName : "",
    "en",
  );
  const translatedValue = applyDerycraftEnglishTextFallback(
    typeof attribute.value === "string" ? attribute.value : "",
    "en",
  );
  const nestedAttribute =
    attribute.attribute && typeof attribute.attribute === "object"
      ? (attribute.attribute as Record<string, unknown>)
      : null;

  return {
    ...attribute,
    name: translatedName || attribute.name,
    attributeName: translatedName || attribute.attributeName,
    linked_to:
      typeof attribute.linked_to === "string"
        ? applyDerycraftEnglishTextFallback(attribute.linked_to, "en")
        : attribute.linked_to,
    value: translatedValue || attribute.value,
    attribute: nestedAttribute
      ? {
          ...nestedAttribute,
          name:
            applyDerycraftEnglishTextFallback(
              typeof nestedAttribute.name === "string" ? nestedAttribute.name : "",
              "en",
            ) || nestedAttribute.name,
        }
      : attribute.attribute,
  };
}

function translateVariantRecord<T extends VariantRecord>(variant: T) {
  const translatedName = applyDerycraftEnglishTextFallback(variant.name, "en");
  const translatedGroup = applyDerycraftEnglishTextFallback(
    variant.group_name ?? variant.groupName,
    "en",
  );

  return {
    ...variant,
    name: translatedName || variant.name,
    group_name: translatedGroup || variant.group_name,
    groupName: translatedGroup || variant.groupName,
    attributes: Array.isArray(variant.attributes)
      ? variant.attributes.map(translateVariantAttribute)
      : variant.attributes,
    raw_attributes: Array.isArray(variant.raw_attributes)
      ? variant.raw_attributes.map(translateVariantAttribute)
      : variant.raw_attributes,
  };
}

export function applyDerycraftEnglishTextFallback(
  value: string | null | undefined,
  locale: StorefrontLocale,
) {
  const source = typeof value === "string" ? value : "";
  if (!source || locale !== "en") {
    return source;
  }

  const exactTranslation = applyExactTextTranslation(source);
  if (exactTranslation) {
    return exactTranslation;
  }

  const colorTranslation = translateColorValue(source);
  if (colorTranslation) {
    return colorTranslation;
  }

  const watchTitleTranslation = translateWatchTitle(source);
  if (watchTitleTranslation) {
    return watchTitleTranslation;
  }

  return replaceAllPairs(source, TEXT_REPLACEMENTS);
}

export function translateDerycraftProductContent<T extends ProductRecord>(
  product: T,
  locale: StorefrontLocale,
) {
  if (!product || locale !== "en") {
    return product;
  }

  const translatedName = applyDerycraftEnglishTextFallback(product.name, locale) || product.name || "";
  let description =
    applyDerycraftEnglishTextFallback(product.description, locale) || product.description || "";
  let shortDescription =
    applyDerycraftEnglishTextFallback(
      product.shortDescription ?? product.short_description,
      locale,
    ) ||
    product.shortDescription ||
    product.short_description ||
    "";
  const family = resolveProductFamily({ ...product, name: translatedName });

  if (!shortDescription || looksTurkish(shortDescription)) {
    shortDescription = buildShortDescription(translatedName, family);
  }

  if (!description || looksTurkish(description)) {
    description = buildDescriptionHtml(translatedName, family);
  }

  let seoTitle =
    applyDerycraftEnglishTextFallback(product.seoTitle ?? product.seo_title, locale) ||
    product.seoTitle ||
    product.seo_title ||
    "";

  if (!seoTitle || looksTurkish(seoTitle)) {
    seoTitle = `${translatedName} | DeryCraft`;
  }

  let seoDescription =
    applyDerycraftEnglishTextFallback(
      product.seoDescription ?? product.seo_description,
      locale,
    ) ||
    product.seoDescription ||
    product.seo_description ||
    "";

  if (!seoDescription || looksTurkish(seoDescription)) {
    seoDescription = buildSeoDescription(translatedName, family);
  }

  return {
    ...product,
    name: translatedName,
    description,
    shortDescription,
    short_description: shortDescription,
    seoTitle,
    seo_title: seoTitle,
    seoDescription,
    seo_description: seoDescription,
    images_v2: Array.isArray(product.images_v2)
      ? product.images_v2.map((image) =>
          typeof image === "string"
            ? image
            : {
                ...image,
                alt: applyDerycraftEnglishTextFallback(image.alt, locale) || image.alt,
              },
        )
      : product.images_v2,
    variants: Array.isArray(product.variants)
      ? product.variants.map((variant) => translateVariantRecord(variant))
      : product.variants,
  };
}

export function translateDerycraftCustomizationSchema<T extends CustomizationSchemaRecord>(
  schema: T,
  locale: StorefrontLocale,
) {
  if (!schema || locale !== "en") {
    return schema;
  }

  return {
    ...schema,
    name: applyDerycraftEnglishTextFallback(schema.name, locale) || schema.name,
    description:
      applyDerycraftEnglishTextFallback(schema.description, locale) || schema.description,
    settings: schema.settings
      ? {
          ...schema.settings,
          submit_button_text:
            applyDerycraftEnglishTextFallback(schema.settings.submit_button_text, locale) ||
            schema.settings.submit_button_text,
          success_message:
            applyDerycraftEnglishTextFallback(schema.settings.success_message, locale) ||
            schema.settings.success_message,
        }
      : schema.settings,
    steps: Array.isArray(schema.steps)
      ? schema.steps.map((step) => ({
          ...step,
          label: applyDerycraftEnglishTextFallback(step.label, locale) || step.label,
          placeholder:
            applyDerycraftEnglishTextFallback(step.placeholder, locale) || step.placeholder,
          help_text: applyDerycraftEnglishTextFallback(step.help_text, locale) || step.help_text,
          options: Array.isArray(step.options)
            ? step.options.map((option) => ({
                ...option,
                label: applyDerycraftEnglishTextFallback(option.label, locale) || option.label,
                description:
                  applyDerycraftEnglishTextFallback(option.description, locale) ||
                  option.description,
                value: option.value,
              }))
            : step.options,
        }))
      : schema.steps,
  };
}
