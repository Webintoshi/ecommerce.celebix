import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(text: string): any {
  console.log("[Toshi] Raw AI response:", text.substring(0, 500));
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1].trim()); } catch (e2) { console.log("[Toshi] Code block parse failed"); }
    }
    const curlyMatch = text.match(/\{[\s\S]*\}/);
    if (curlyMatch) {
      try { return JSON.parse(curlyMatch[0]); } catch (e3) { console.log("[Toshi] Curly brace extract failed"); }
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAIForJSON(prompt: string): Promise<any> {
  const text = await callAI(prompt, { temperature: 0.4, maxTokens: 2048 });
  const parsed = extractJSON(text);
  if (!parsed) throw new Error(`Invalid JSON response. Raw: ${text.substring(0, 200)}`);
  return parsed;
}

function buildSEOPrompt(name: string, category?: string, description?: string): string {
  const brand = STOREFRONT_RUNTIME.name;
  return `Sen Toshi - 15 yillik deneyimli bir E-ticaret SEO uzmanisin.

URUN: ${name}
${category ? `Kategori: ${category}` : ''}
${description ? `Aciklama: ${description}` : ''}

GOREV: Bu urun icin Google SERP'da en yuksek tiklanma orani saglayacak meta baslik ve aciklama olustur.

KURALLAR:
1. Meta baslik: 50-60 karakter arasi (Google 60'ta keser)
2. Meta aciklama: 150-160 karakter arasi (Google 160'ta keser)  
3. Marka | ${brand} olarak SONDA olmali
4. Urun neyse onu yaz: spor ayakkabi ise ayakkabi, ekipman ise ekipman, giyim ise giyim
5. Kesinlikle karakter limitlerini asma

CIKTI FORMATI (SADECE JSON, baska hicbir sey yazma):
{
  "metaTitle": "50-60 karakter arasi baslik | ${brand}",
  "metaDescription": "150-160 karakter arasi aciklama"
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

    const prompt = buildSEOPrompt(name, category, description);
    const aiResponse = await callAIForJSON(prompt);

    let title = aiResponse.metaTitle || "";
    let desc = aiResponse.metaDescription || "";

    // Hard limit enforcement
    if (title.length > 60) title = title.substring(0, 57) + "...";
    if (desc.length > 160) desc = desc.substring(0, 157) + "...";

    if (!title || !desc) {
      return NextResponse.json({
        success: false,
        error: "AI yaniti eksik"
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      metaTitle: title,
      metaDescription: desc,
      source: "toshi_ai"
    });

  } catch (error: any) {
    console.error("[Toshi] Error:", error);

    return NextResponse.json({
      success: false,
      error: `Toshi calisamiyor: ${error.message}`
    }, { status: 500 });
  }
}
