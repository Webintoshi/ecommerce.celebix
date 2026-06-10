export type FloatingFaqItem = {
  question: string;
  answer: string;
};

export const DEFAULT_FLOATING_FAQ_ITEMS: FloatingFaqItem[] = [
  {
    question: "Teslimat süresi ne kadar?",
    answer:
      "Ürünlerimizin üretim süresi, seçtiğiniz ürün türü ve kişiselleştirme taleplerinize göre değişiklik gösterir. Net teslimat süresi için bizimle iletişime geçebilirsiniz.",
  },
  {
    question: "Numune gönderiyor musunuz?",
    answer:
      "Evet. Numune talebiniz üzerine örnek ürünler gönderebiliriz. Dilerseniz atölyemize davet ederek ürünleri yerinde incelemenizi de sağlayabiliriz.",
  },
  {
    question: "Minimum sipariş miktarı var mı?",
    answer:
      "Talep edilen ürün türüne göre minimum adet değişebilir. Kurumsal talebinizi ilettiğinizde sizin için en uygun adet ve teklif yapısını birlikte netleştiririz.",
  },
  {
    question: "Ürünleri kişiselleştirmek için hangi seçenekleri sunuyorsunuz?",
    answer:
      "Logo baskısı, isim, özel mesaj, kutulama ve kurumsal renklere uygun detaylar gibi farklı kişiselleştirme seçenekleri sunuyoruz.",
  },
  {
    question: "Toplu siparişlerde indirim var mı?",
    answer:
      "Evet. Sipariş miktarınıza göre özel fiyatlandırma hazırlıyoruz. Detaylı teklif için bizimle iletişime geçebilirsiniz.",
  },
  {
    question: "Kişiselleştirilmiş siparişlerde iade veya değişim yapabilir miyiz?",
    answer:
      "Kişiselleştirilmiş ürünlerde standart iade ve değişim uygulanmaz. Ancak üretim kaynaklı bir sorun yaşanırsa sizin için en doğru çözümü birlikte planlarız.",
  },
];

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeFaqItem(question: string, answer: string): FloatingFaqItem | null {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim();
  const normalizedAnswer = answer.replace(/\s+/g, " ").trim();

  if (normalizedQuestion.length < 4 || normalizedAnswer.length < 8) {
    return null;
  }

  return {
    question: normalizedQuestion.endsWith("?")
      ? normalizedQuestion
      : `${normalizedQuestion}?`,
    answer: normalizedAnswer,
  };
}

/**
 * Admin SSS sayfasındaki zengin metinden soru-cevap çiftleri çıkarır.
 * h2/h3 başlıkları soru, sonraki paragraflar cevap olarak okunur.
 */
export function parseFloatingFaqItemsFromHtml(contentHtml: string): FloatingFaqItem[] {
  if (!contentHtml.trim()) {
    return [];
  }

  const items: FloatingFaqItem[] = [];
  const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const matches = [...contentHtml.matchAll(headingRegex)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const question = stripHtml(match[2] ?? "");
    const sectionStart = (match.index ?? 0) + match[0].length;
    const sectionEnd = matches[index + 1]?.index ?? contentHtml.length;
    const sectionHtml = contentHtml.slice(sectionStart, sectionEnd);

    const paragraphMatches = [
      ...sectionHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi),
    ].map((paragraph) => stripHtml(paragraph[1] ?? ""));

    const answer = paragraphMatches.filter(Boolean).join("\n\n").trim();
    const item = normalizeFaqItem(question, answer);

    if (item) {
      items.push(item);
    }
  }

  return items;
}

export function resolveFloatingFaqItems(contentHtml?: string | null): FloatingFaqItem[] {
  const parsed = contentHtml ? parseFloatingFaqItemsFromHtml(contentHtml) : [];
  return parsed.length > 0 ? parsed : DEFAULT_FLOATING_FAQ_ITEMS;
}

const DEFAULT_FAQ_INTRO =
  "Sipariş, teslimat, kişiselleştirme ve kurumsal talepler hakkında en sık sorulan soruları derledik.";

/**
 * Hero alanı için kısa giriş metni. Tüm plainText kullanılmaz — SSS tekrarını önler.
 */
export function resolveFaqIntro(contentHtml?: string | null, seoDescription?: string | null): string {
  if (contentHtml) {
    const headingMatch = contentHtml.match(/<h[23][^>]*>/i);
    if (headingMatch?.index && headingMatch.index > 0) {
      const introHtml = contentHtml.slice(0, headingMatch.index);
      const paragraphs = [
        ...introHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi),
      ]
        .map((paragraph) => stripHtml(paragraph[1] ?? ""))
        .filter(Boolean);

      const intro = paragraphs.join(" ").trim();
      if (intro.length >= 20 && intro.length <= 280) {
        return intro;
      }
    }
  }

  if (seoDescription?.trim()) {
    return seoDescription.trim();
  }

  return DEFAULT_FAQ_INTRO;
}
