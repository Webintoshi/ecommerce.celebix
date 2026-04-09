/**
 * SEO Prompt Templates - Dynamic & Product-Agnostic
 * 
 * These prompts analyze product information and generate
 * SEO-optimized metadata without hardcoded categories.
 */

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

/**
 * Main SEO Expert Prompt - Analyzes any product type (Optimized for Gemini)
 */
export function buildSEOPrompt(context: ProductSEOContext): string {
  const {
    name,
    description,
    shortDescription,
    category,
    subcategory,
    tags = [],
    features = [],
    brand = "Ornek Magaza"
  } = context;

  // Combine all product info for analysis
  const fullDescription = [name, shortDescription, description]
    .filter(Boolean)
    .join(". ");

  return `
Sen E-ticaret SEO uzmanısın. Aşağıdaki ürün için meta başlık ve açıklama oluştur.

ÜRÜN: ${name}
${category ? `Kategori: ${category}` : ""}
Açıklama: ${fullDescription}
Marka: ${brand}

KURALLAR:
- Meta başlık: 50-60 karakter, marka sona eklenmeli (| ${brand})
- Meta açıklama: 150-160 karakter, CTA içermeli
- Türkçe karakterleri doğru kullan
- SADECE JSON formatında yanıt ver, başka açıklama yok

JSON FORMATI:
\`\`\`json
{
  "metaTitle": "...",
  "metaDescription": "..."
}
  \`\`\`

## SEO ANALİZİ YAPMAN GEREKENLER

1. **ÜRÜN KATEGORİSİ TESPİTİ**
   - Ürün adından ana kategori (gıda, kozmetik, tekstil, elektronik vb.)
   - Alt kategori ve niş belirleme
   - Hedef kitlenin arama davranışı analizi

2. **ANAHTAR KELİME ARAŞTIRMASI (Sanal)**
   - Yüksek hacimli, düşük rekabetli long-tail kelimeler
   - Transactional intent (satın alma niyeti) olan kelimeler
   - Yerel SEO için "Türkiye", "online", "kapıda ödeme" gibi modifikatörler

3. **META BAŞLIK STRATEJİSİ**
   - 50-60 karakter (pixel hesabıyla)
   - Yapı: Anahtar Kelime + Fayda/Özellik + Marka
   - Örnekler:
     * "Doğal Fıstık Ezmesi 500gr | Şekersiz & Katkısız | ${brand}"
     * "Organik Badem Ezmesi | Vegan & Glutensiz | ${brand}"
   - Güç kelimeleri: "Doğal", "Organik", "Premium", "Özel", "Kampanya"

4. **META AÇIKLAMA STRATEJİSİ**
   - 150-160 karakter arası
   - Yapı: Sorun + Çözüm + Fayda + CTA (Call-to-Action)
   - İkna edici dil kullanımı
   - Emoji KULLANMA (Google SERP'da profesyonel görünüm)
   - Örnek: "%100 doğal fıstık ezmesi, şeker ilavesiz. Sporcular için ideal protein kaynağı. Hemen sipariş ver, kapıda öde!"

5. **SCHHEMA MARKUP ÖNERİLERİ**
   - Product schema için önerilen alanlar
   - FAQ schema için 3 soru önerisi

## ÇIKTI FORMATI (SADECE JSON)

\`\`\`json
{
  "analysis": {
    "detectedCategory": "Kategori tespiti",
    "targetAudience": "Hedef kitle analizi",
    "mainKeywords": ["Anahtar kelime 1", "Anahtar kelime 2"],
    "searchIntent": "informational/commercial/transactional"
  },
  "metaTitle": "50-60 karakter arası meta başlık",
  "metaDescription": "150-160 karakter arası meta açıklama",
  "keywords": ["5 adet long-tail anahtar kelime"],
  "schema": {
    "type": "Product/Offer/ItemList",
    "suggestedFields": ["alan1", "alan2"]
  },
  "faq": [
    {"question": "Soru 1?", "answer": "Cevap 1"},
    {"question": "Soru 2?", "answer": "Cevap 2"},
    {"question": "Soru 3?", "answer": "Cevap 3"}
  ],
  "rationale": "Bu SEO stratejisini neden seçtiğinin 2-3 cümlelik açıklaması"
}
\`\`\`

## KRİTİK KURALLAR

1. Ürün adını ve kategorisini analiz ederek doğru hedefleme yap
2. Meta başlıkta marka mutlaka sona eklensin (| ${brand})
3. Meta açıklamada CTA (Hemen sipariş ver, Keşfet, İncele vb.) mutlaka olsun
4. Türkçe karakterleri doğru kullan (ı, İ, ş, ç, ö, ğ, ü)
5. Rakip analizi yaparak farklılaştırıcı özellikleri vurgula
6. Mevsimsel/kampanyalı dil kullan (Yaz indirimi, Yılbaşı özel vb. - uygunsa)
7. SADECE JSON çıktısı ver, başka açıklama ekleme
`;
}

/**
 * Category SEO Prompt
 */
export function buildCategorySEOPrompt(
  name: string,
  description?: string | null,
  products?: string[]
): string {
  return `
Sen bir E-ticaret kategori SEO uzmanısın.

KATEGORİ: ${name}
${description ? `AÇIKLAMA: ${description}` : ""}
${products && products.length > 0 ? `ÖRNEK ÜRÜNLER: ${products.slice(0, 5).join(", ")}` : ""}

GÖREV: Bu kategori sayfası için:
1. CollectionPage schema uyumlu meta başlık
2. Kategori açıklaması (description)
3. Hedef anahtar kelimeler

ÇIKTI (JSON):
\`\`\`json
{
  "metaTitle": "...",
  "metaDescription": "...",
  "keywords": [],
  "rationale": "..."
}
\`\`\`
`;
}

/**
 * Page SEO Prompt (Static pages)
 */
export function buildPageSEOPrompt(
  pageName: string,
  pageType: string,
  description?: string
): string {
  const typeGuidance: Record<string, string> = {
    "WebSite": "Ana sayfa için marka odaklı, genel kapsamlı SEO",
    "ContactPage": "İletişim sayfası için güven ve erişilebilirlik vurgusu",
    "AboutPage": "Hakkımızda sayfası için marka hikayesi ve değerler",
    "FAQPage": "SSS sayfası için bilgilendirici ve soru-cevap odaklı",
    "CollectionPage": "Kategori sayfası için ürün odaklı"
  };

  return `
Sen bir statik sayfa SEO uzmanısın.

SAYFA: ${pageName}
SAYFA TİPİ: ${pageType}
${description ? `MEVCUT AÇIKLAMA: ${description}` : ""}

REHBER: ${typeGuidance[pageType] || "Genel SEO kuralları"}

GÖREV: Bu sayfa için:
1. ${pageType} schema uyumlu meta başlık
2. İkna edici meta açıklama

ÇIKTI (JSON):
\`\`\`json
{
  "metaTitle": "...",
  "metaDescription": "...",
  "keywords": [],
  "rationale": "..."
}
\`\`\`
`;
}

/**
 * Fallback template generator (when AI fails)
 */
export function generateFallbackSEO(productName: string, category?: string): {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
} {
  const brand = "Ornek Magaza";
  
  // Category-based templates
  const templates: Record<string, (name: string) => { title: string; desc: string; keywords: string[] }> = {
    default: (name) => ({
      title: `${name} | En Uygun Fiyat | ${brand}`,
      desc: `${name} ürünü ${brand} garantisiyle kapınıza gelsin. Hızlı kargo, güvenli alışveriş. Hemen sipariş ver!`,
      keywords: [name.toLowerCase(), `${name} fiyat`, `${name} satın al`]
    }),
    food: (name) => ({
      title: `${name} | Doğal & Katkısız | ${brand}`,
      desc: `Taze ${name} ${brand} farkıyla! Doğal içerik, katkı maddesi yok. Sağlıklı beslenmenin adresi. Hemen sipariş ver!`,
      keywords: [name.toLowerCase(), `doğal ${name}`, `${name} fiyat`]
    }),
    cosmetic: (name) => ({
      title: `${name} | Cilt Bakımı | ${brand}`,
      desc: `Etkili ${name} çözümü ${brand}'da! Doğal içerikli, dermatolojik olarak test edilmiş. Kapıda ödeme imkanı!`,
      keywords: [name.toLowerCase(), `${name} bakım`, `doğal ${name}`]
    })
  };

  const categoryKey = category?.toLowerCase().includes("ezme") || 
                      category?.toLowerCase().includes("gıda") ||
                      category?.toLowerCase().includes("besin") 
                      ? "food" : "default";
  
  const template = templates[categoryKey] || templates.default;
  const result = template(productName);

  return {
    metaTitle: result.title,
    metaDescription: result.desc,
    keywords: result.keywords
  };
}
