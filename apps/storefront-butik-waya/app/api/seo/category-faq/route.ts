import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(text: string): any {
  console.log("[Toshi Category FAQ] Raw AI response:", text.substring(0, 500));
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

function buildCategoryFAQPrompt(name: string, description?: string): string {
  return `Sen Toshi - 15 yıllık deneyimli bir e-ticaret içerik uzmanısın. Google FAQ rich snippet uzmanısısın.

KATEGORİ: ${name}
${description ? `Açıklama: ${description}` : ""}

GÖREV: Bu KATEGORİ için Google'da sıkça aranan, gerçek kullanıcıların merak ettiği 3-5 adet FAQ (Soru-Cevap) oluştur.

KATEGORİ OLDUĞUNU UNUTMA! Bu bir ürün değil, bir kategori/koleksiyon sayfası.

KURALLAR:
1. Sorular gerçek müşterilerin sorduğu gibi olmalı
2. Cevaplar 1-2 cümle, öz ve net olmalı
3. Kesinlikle 3 ile 5 arası soru olmalı
4. Sorular kategoriye özgü olmalı
5. Google FAQ schema uyumlu formatta olmalı

KATEGORİ İÇİN ÖRNEK SORU TİPLERİ:
- Bu kategori nedir? İçerisinde ne tür ürünler var?
- Bu kategorideki ürünler kimler için uygundur?
- Bu kategori ile ilgili bilinmesi gerekenler nelerdir?
- Hangi durumlarda bu kategoriden ürün tercih edilmeli?
- Bu kategorideki ürünlerin ortak özellikleri nelerdir?

ÇIKTI FORMATI (SADECE JSON):
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

    const prompt = buildCategoryFAQPrompt(name, description);
    const aiResponse = await callAIForJSON(prompt);

    if (!aiResponse.faq || !Array.isArray(aiResponse.faq) || aiResponse.faq.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "AI geçerli FAQ oluşturamadı",
        },
        { status: 500 },
      );
    }

    const validFAQ = aiResponse.faq.filter(
      (item: any) => item.question && item.answer && typeof item.question === "string" && typeof item.answer === "string",
    );

    if (validFAQ.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "AI geçerli FAQ formatı döndürmedi",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      faq: validFAQ,
      source: "toshi_category_faq",
    });
  } catch (error: any) {
    console.error("[Toshi Category FAQ] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: `Toshi FAQ oluşturamıyor: ${error.message}`,
      },
      { status: 500 },
    );
  }
}
