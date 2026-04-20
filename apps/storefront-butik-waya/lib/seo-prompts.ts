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
  const { name, description, shortDescription, category, tags = [], features = [], brand = STOREFRONT_RUNTIME.name } = context;

  const fullDescription = [name, shortDescription, description, ...tags, ...features].filter(Boolean).join(". ");

  return `
Sen deneyimli bir e-ticaret SEO uzmanısın. Aşağıdaki ürün için meta başlık ve açıklama oluştur.

ÜRÜN: ${name}
${category ? `Kategori: ${category}` : ""}
Açıklama: ${fullDescription}
Marka: ${brand}

KURALLAR:
- Meta başlık 50-60 karakter olmalı ve marka sonda "| ${brand}" olarak yer almalı.
- Meta açıklama 150-160 karakter olmalı ve net bir CTA içermeli.
- Türkçe karakterleri doğru kullan.
- Sadece JSON dön.

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

export function buildCategorySEOPrompt(name: string, description?: string | null, products?: string[]) {
  return `
Sen bir kategori SEO uzmanısın.

KATEGORİ: ${name}
${description ? `AÇIKLAMA: ${description}` : ""}
${products && products.length > 0 ? `ÖRNEK ÜRÜNLER: ${products.slice(0, 5).join(", ")}` : ""}

GÖREV:
1. CollectionPage uyumlu meta başlık
2. Meta açıklama
3. Hedef anahtar kelimeler

ÇIKTI:
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
    WebSite: "Ana sayfa için marka ve teklif netliği üret.",
    ContactPage: "İletişim sayfası için güven ve erişilebilirlik vurgusu yap.",
    AboutPage: "Marka hikâyesi ve değer önerisini öne çıkar.",
    FAQPage: "Soru-cevap odaklı açık ve net bir dil kullan.",
    CollectionPage: "Kategori niyeti ve ürün grubunu kuvvetlendir.",
  };

  return `
Sen bir statik sayfa SEO uzmanısın.

SAYFA: ${pageName}
TİP: ${pageType}
${description ? `MEVCUT AÇIKLAMA: ${description}` : ""}

REHBER: ${typeGuidance[pageType] || "Genel SEO kuralları"}

ÇIKTI:
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
      title: `${name} | Premium Seçim | ${brand}`,
      desc: `${name} için güçlü ürün sayfası, güven veren açıklama ve hızlı sipariş akışı ${brand} ile hazır.`,
      keywords: [name.toLowerCase(), `${name} fiyat`, `${name} satın al`],
    }),
    accessory: (name) => ({
      title: `${name} | Zamansız Tasarım | ${brand}`,
      desc: `${name} için kaliteli malzeme, güçlü sunum ve hızlı sipariş akışı. Koleksiyonu ${brand} üzerinden inceleyin.`,
      keywords: [name.toLowerCase(), `${name} tasarım`, `${name} koleksiyon`],
    }),
  };

  const categoryKey = /aksesuar|canta|saat|kartlik|kayis|deri/.test(normalizedCategory) ? "accessory" : "default";

  return {
    metaTitle: templates[categoryKey](productName).title,
    metaDescription: templates[categoryKey](productName).desc,
    keywords: templates[categoryKey](productName).keywords,
  };
}
