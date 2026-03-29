import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(text: string): any {
  console.log("[Toshi Page FAQ] Raw AI response:", text.substring(0, 500));
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

function buildPageFAQPrompt(name: string, url?: string, description?: string): string {
  return `Sen Toshi - 15 yillik deneyimli bir E-ticaret icerik uzmanisin. Google FAQ rich snippet uzmanisisin.

SAYFA: ${name}
${url ? `URL: ${url}` : ''}
${description ? `Aciklama: ${description}` : ''}

GOREV: Bu SAYFA icin Google'da sikca aranan, gercek kullanicilarin merak ettigi 3-5 adet FAQ (Soru-Cevap) olustur.

SAYFA OLDUGUNU UNUTMA! Bu bir urun veya kategori degil, bir bilgi/icerik sayfasi (Hakkimizda, Iletisim, vb.).

KURALLAR:
1. Sorular gercek ziyaretcilerin sordugu gibi olmali
2. Cevaplar 1-2 cumle, oz ve net olmali
3. Kesinlikle 3 ile 5 arasi soru olmali
4. Sorular SAYFAYA ozgu olmali (sayfanin konusuyla ilgili)
5. Google FAQ schema uyumlu formatta olmali

SAYFA ICIN ORNEK SORU TIPLERI:
- Bu sayfada ne tur bilgiler bulabilirim?
- Bu konu hakkinda temel bilgiler nelerdir?
- Bu sayfa kimin icin faydali?
- Bu sayfadaki bilgiler ne kadar guncel?
- Bu konu ile ilgili baska ne ogrenebilirim?
- Bu sayfayi ziyaret etme nedenlerim nelerdir?

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
    const { name, url, description } = body;

    if (!name) {
      return NextResponse.json({
        success: false,
        error: "Sayfa adi zorunludur"
      }, { status: 400 });
    }

    const prompt = buildPageFAQPrompt(name, url, description);
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
      source: "toshi_page_faq"
    });

  } catch (error: any) {
    console.error("[Toshi Page FAQ] Error:", error);

    return NextResponse.json({
      success: false,
      error: `Toshi FAQ olusturamiyor: ${error.message}`
    }, { status: 500 });
  }
}
