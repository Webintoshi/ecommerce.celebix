import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export interface ProductSEOContext {
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  category?: string;
  subcategory?: string | null;
  tags?: string[];
  features?: string[];
  targetAudience?: string;
  brand?: string;
}

export function buildSEOPrompt(context: ProductSEOContext): string {
  const {
    name,
    description,
    shortDescription,
    category,
    tags = [],
    features = [],
    brand = STOREFRONT_RUNTIME.name,
  } = context;

  const fullDescription = [name, shortDescription, description, ...tags, ...features]
    .filter(Boolean)
    .join(". ");

  return `
Sen deneyimli bir e-ticaret SEO uzmansin. Asagidaki urun icin meta baslik ve aciklama olustur.

URUN: ${name}
${category ? `Kategori: ${category}` : ""}
Aciklama: ${fullDescription}
Marka: ${brand}

KURALLAR:
- Meta baslik 50-60 karakter olmali ve marka sonda "| ${brand}" olarak yer almali.
- Meta aciklama 150-160 karakter olmali ve net bir CTA icermeli.
- Turkce karakterleri dogru kullan.
- Sadece JSON don.

JSON:
\`\`\`json
{
  "analysis": {
    "detectedCategory": "",
    "targetAudience": "",
    "mainKeywords": [],
    "searchIntent": "transactional"
  },
  "metaTitle": "",
  "metaDescription": "",
  "keywords": [],
  "schema": {
    "type": "Product",
    "suggestedFields": []
  },
  "faq": [],
  "rationale": ""
}
\`\`\`
`;
}

export function buildCategorySEOPrompt(
  name: string,
  description?: string | null,
  products?: string[],
) {
  return `
Sen bir kategori SEO uzmansin.

KATEGORI: ${name}
${description ? `ACIKLAMA: ${description}` : ""}
${products && products.length > 0 ? `ORNEK URUNLER: ${products.slice(0, 5).join(", ")}` : ""}

GOREV:
1. CollectionPage uyumlu meta baslik
2. Meta aciklama
3. Hedef anahtar kelimeler

CIKTI:
\`\`\`json
{
  "metaTitle": "",
  "metaDescription": "",
  "keywords": [],
  "rationale": ""
}
\`\`\`
`;
}

export function buildPageSEOPrompt(pageName: string, pageType: string, description?: string) {
  const typeGuidance: Record<string, string> = {
    WebSite: "Ana sayfa icin marka ve teklif netligi uret.",
    ContactPage: "Iletisim sayfasi icin guven ve erisilebilirlik vurgusu yap.",
    AboutPage: "Marka hikayesi ve deger onerisini one cikar.",
    FAQPage: "Soru-cevap odakli acik ve net bir dil kullan.",
    CollectionPage: "Kategori niyeti ve urun grubunu kuvvetlendir.",
  };

  return `
Sen bir statik sayfa SEO uzmansin.

SAYFA: ${pageName}
TIP: ${pageType}
${description ? `MEVCUT ACIKLAMA: ${description}` : ""}

REHBER: ${typeGuidance[pageType] || "Genel SEO kurallari"}

CIKTI:
\`\`\`json
{
  "metaTitle": "",
  "metaDescription": "",
  "keywords": [],
  "rationale": ""
}
\`\`\`
`;
}

export function generateFallbackSEO(productName: string, category?: string) {
  const brand = STOREFRONT_RUNTIME.name;
  const normalizedCategory = category?.toLowerCase() || "";

  const templates: Record<string, (name: string) => { title: string; desc: string; keywords: string[] }> = {
    default: (name) => ({
      title: `${name} | Premium Secim | ${brand}`,
      desc: `${name} icin guclu urun sayfasi, guven veren aciklama ve hizli siparis akisi ${brand} ile hazir.`,
      keywords: [name.toLowerCase(), `${name} fiyat`, `${name} satin al`],
    }),
    accessory: (name) => ({
      title: `${name} | Spor Aksesuar | ${brand}`,
      desc: `${name} icin kullanim odakli bilgi, net fiyat ve hizli siparis akisi. Koleksiyonu ${brand} uzerinden inceleyin.`,
      keywords: [name.toLowerCase(), `${name} spor`, `${name} aksesuar`],
    }),
  };

  const categoryKey = /aksesuar|fitness|outdoor|ekipman|antrenman/.test(normalizedCategory)
    ? "accessory"
    : "default";

  return {
    metaTitle: templates[categoryKey](productName).title,
    metaDescription: templates[categoryKey](productName).desc,
    keywords: templates[categoryKey](productName).keywords,
  };
}
