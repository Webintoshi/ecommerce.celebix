import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(text: string): any {
  console.log("[Toshi FAQ] Raw AI response:", text.substring(0, 500));

  try {
    return JSON.parse(text.trim());
  } catch (e) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e2) { }
    }

    const curlyMatch = text.match(/\{[\s\S]*\}/);
    if (curlyMatch) {
      try {
        return JSON.parse(curlyMatch[0]);
      } catch (e3) { }
    }
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAIForJSON(prompt: string): Promise<any> {
  const text = await callAI(prompt, { temperature: 0.5, maxTokens: 2048 });
  const parsed = extractJSON(text);
  if (!parsed) {
    throw new Error(`Invalid JSON response. Raw: ${text.substring(0, 200)}`);
  }
  return parsed;
}

function buildFAQPrompt(name: string, category?: string, description?: string): string {
  return `Sen Toshi - 15 yillik deneyimli bir E-ticaret icerik uzmanisin. Google FAQ rich snippet uzmanisisin.

URUN: ${name}
${category ? `Kategori: ${category}` : ''}
${description ? `Aciklama: ${description}` : ''}

GOREV: Bu urun icin Google'da sikca aranan, gercek kullanicilarin merak ettigi 3-5 adet FAQ (Soru-Cevap) olustur.

KURALLAR:
1. Sorular gercek musterilerin sordugu gibi olmali
2. Cevaplar 1-2 cumle, oz ve net olmali
3. Kesinlikle 3 ile 5 arasi soru olmali
4. Sorular urune ozgu olmali (genel sorular sorma)
5. Google FAQ schema uyumlu formatta olmali

ORNEK SORU TIPLERI:
- Urun icerigi/nedir?
- Nasil kullanilir/tuketilir?
- Saklama kosullari nedir?
- Kimler icin uygundur?
- Alerjen icerigi var mi?
- Iade/garanti politikasi?

CIKTI FORMATI (SADECE JSON):
{
  "faq": [
    {"question": "Soru metni?", "answer": "Cevap metni."},
    {"question": "Soru metni?", "answer": "Cevap metni."},
    {"question": "Soru metni?", "answer": "Cevap metni."}
  ]
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category, description } = body;

    if (!name) {
      return NextResponse.json({
        success: false,
        error: "Urun adi zorunludur"
      }, { status: 400 });
    }

    const prompt = buildFAQPrompt(name, category, description);
    const aiResponse = await callAIForJSON(prompt);

    if (!aiResponse.faq || !Array.isArray(aiResponse.faq) || aiResponse.faq.length === 0) {
      return NextResponse.json({
        success: false,
        error: "AI gecerli FAQ olusturamadi"
      }, { status: 500 });
    }

    // Validate FAQ structure
    const validFAQ = aiResponse.faq.filter((item: any) =>
      item.question && item.answer &&
      typeof item.question === 'string' &&
      typeof item.answer === 'string'
    );

    if (validFAQ.length === 0) {
      return NextResponse.json({
        success: false,
        error: "AI gecerli FAQ formati dondurmedi"
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      faq: validFAQ,
      source: "toshi_faq"
    });

  } catch (error: any) {
    console.error("[Toshi FAQ] Error:", error);

    return NextResponse.json({
      success: false,
      error: `Toshi FAQ olusturamiyor: ${error.message}`
    }, { status: 500 });
  }
}
