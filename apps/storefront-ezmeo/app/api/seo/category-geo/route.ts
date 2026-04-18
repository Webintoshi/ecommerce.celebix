import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(text: string): any {
  console.log("[Toshi Category GEO] Raw AI response:", text.substring(0, 500));
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) { try { return JSON.parse(jsonMatch[1].trim()); } catch (e2) { } }
    const curlyMatch = text.match(/\{[\s\S]*\}/);
    if (curlyMatch) { try { return JSON.parse(curlyMatch[0]); } catch (e3) { } }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAIForJSON(prompt: string): Promise<any> {
  const text = await callAI(prompt, { temperature: 0.5, maxTokens: 2048 });
  const parsed = extractJSON(text);
  if (!parsed) throw new Error(`Invalid JSON response. Raw: ${text.substring(0, 200)}`);
  return parsed;
}

function buildCategoryGEOPrompt(name: string, description?: string): string {
  return `Sen Toshi - 15 yillik deneyimli bir GEO (Generative Engine Optimization) ve LLM Optimization uzmanisisin.

KATEGORI: ${name}
${description ? `Aciklama: ${description}` : ''}

GOREV: Bu KATEGORI icin ChatGPT, Perplexity, Claude ve diger AI sistemlerinin dogru anlayip onerebilmesi icin "Onemli Cikarimlar" (Key Takeaways) olustur.

KATEGORI OLDUGUNU UNUTMA! Bu bir urun degil, bir kategori/koleksiyon sayfasi.

NEDIR BU?
GEO/LLM Optimizasyonu, AI sistemlerinin kategoriyi dogru anlamasini saglar. Ornegin bir kullanici "Saglikli beslenme onerileri" dediginde AI bu kategoriyi onerebilsin.

KURALLAR:
1. Her cikarim 1 cümle, net ve oz olmali
2. 5 ile 8 arasi cikarim olmali
3. Cikarimlar SEO anahtar kelimeleri icermeli
4. Kategorinin ESSIZ faydalarini vurgula
5. AI sistemlerinin context'ini zenginlestirecek bilgiler

KATEGORI ICIN CIKARIM TIPLERI:
- Bu kategori nedir? Icerigi nedir?
- Bu kategori hangi ihtiyaclari karsilar?
- Bu kategori kimler icin uygundur?
- Bu kategorideki urunlerin ortak ozellikleri nelerdir?
- Bu kategori neden tercih edilmeli?
- Bu kategori ile ilgili bilinmesi gerekenler nelerdir?

CIKTI FORMATI (SADECE JSON):
{
  "takeaways": [
    "Cikarim 1",
    "Cikarim 2", 
    "Cikarim 3",
    "Cikarim 4",
    "Cikarim 5"
  ]
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({
        success: false,
        error: "Kategori adi zorunludur"
      }, { status: 400 });
    }

    const prompt = buildCategoryGEOPrompt(name, description);
    const aiResponse = await callAIForJSON(prompt);

    if (!aiResponse.takeaways || !Array.isArray(aiResponse.takeaways) || aiResponse.takeaways.length === 0) {
      return NextResponse.json({
        success: false,
        error: "AI gecerli cikarim olusturamadi"
      }, { status: 500 });
    }

    // Validate takeaways
    const validTakeaways = aiResponse.takeaways.filter((item: any) =>
      typeof item === 'string' && item.length > 10
    );

    if (validTakeaways.length === 0) {
      return NextResponse.json({
        success: false,
        error: "AI gecerli format dondurmedi"
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      takeaways: validTakeaways,
      source: "toshi_category_geo"
    });

  } catch (error: any) {
    console.error("[Toshi Category GEO] Error:", error);

    return NextResponse.json({
      success: false,
      error: `Toshi GEO olusturamiyor: ${error.message}`
    }, { status: 500 });
  }
}
