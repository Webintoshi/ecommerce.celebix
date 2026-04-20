import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(text: string): any {
  console.log("[Toshi Category GEO] Raw AI response:", text.substring(0, 500));
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e2) {}
    }
    const curlyMatch = text.match(/\{[\s\S]*\}/);
    if (curlyMatch) {
      try {
        return JSON.parse(curlyMatch[0]);
      } catch (e3) {}
    }
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
  return `Sen Toshi - 15 yıllık deneyimli bir GEO (Generative Engine Optimization) ve LLM Optimization uzmanısısın.

KATEGORİ: ${name}
${description ? `Açıklama: ${description}` : ""}

GÖREV: Bu KATEGORİ için ChatGPT, Perplexity, Claude ve diğer AI sistemlerinin doğru anlayıp önerebilmesi için "Önemli Çıkarımlar" (Key Takeaways) oluştur.

KATEGORİ OLDUĞUNU UNUTMA! Bu bir ürün değil, bir kategori/koleksiyon sayfası.

NEDİR BU?
GEO/LLM Optimizasyonu, AI sistemlerinin kategoriyi doğru anlamasını sağlar. Örneğin bir kullanıcı "Sağlıklı beslenme önerileri" dediğinde AI bu kategoriyi önerebilsin.

KURALLAR:
1. Her çıkarım 1 cümle, net ve öz olmalı
2. 5 ile 8 arası çıkarım olmalı
3. Çıkarımlar SEO anahtar kelimeleri içermeli
4. Kategorinin eşsiz faydalarını vurgula
5. AI sistemlerinin context'ini zenginleştirecek bilgiler

KATEGORİ İÇİN ÇIKARIM TİPLERİ:
- Bu kategori nedir? İçeriği nedir?
- Bu kategori hangi ihtiyaçları karşılar?
- Bu kategori kimler için uygundur?
- Bu kategorideki ürünlerin ortak özellikleri nelerdir?
- Bu kategori neden tercih edilmeli?
- Bu kategori ile ilgili bilinmesi gerekenler nelerdir?

ÇIKTI FORMATI (SADECE JSON):
{
  "takeaways": [
    "Çıkarım 1",
    "Çıkarım 2",
    "Çıkarım 3",
    "Çıkarım 4",
    "Çıkarım 5"
  ]
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Kategori adı zorunludur",
        },
        { status: 400 },
      );
    }

    const prompt = buildCategoryGEOPrompt(name, description);
    const aiResponse = await callAIForJSON(prompt);

    if (!aiResponse.takeaways || !Array.isArray(aiResponse.takeaways) || aiResponse.takeaways.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "AI geçerli çıkarım oluşturamadı",
        },
        { status: 500 },
      );
    }

    const validTakeaways = aiResponse.takeaways.filter((item: any) => typeof item === "string" && item.length > 10);

    if (validTakeaways.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "AI geçerli format döndürmedi",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      takeaways: validTakeaways,
      source: "toshi_category_geo",
    });
  } catch (error: any) {
    console.error("[Toshi Category GEO] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: `Toshi GEO oluşturamıyor: ${error.message}`,
      },
      { status: 500 },
    );
  }
}
