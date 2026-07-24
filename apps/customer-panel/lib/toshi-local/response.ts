import type { ToshiLocalIntent, ToshiLocalReply, ToshiLocalSource } from "./types.ts";

function source(label: string, href: ToshiLocalSource["href"]): ToshiLocalSource {
  return Object.freeze({ label, href });
}

function reply(text: string, sources: readonly ToshiLocalSource[] = []): ToshiLocalReply {
  return Object.freeze({ text, sources: Object.freeze([...sources]) });
}

export function projectToshiLocalReply(intent: ToshiLocalIntent, payload: unknown): ToshiLocalReply {
  void payload;
  switch (intent.kind) {
    case "store_summary": return reply("Mağaza özetini gösteriyorum.", [source("Mağaza özeti", "/")]);
    case "pending_orders": return reply("Bekleyen siparişleri gösteriyorum.", [source("Siparişler", "/orders")]);
    case "low_stock": return reply("Düşük stoklu ürünleri gösteriyorum.", [source("Ürünler", "/products")]);
    case "find_order": return reply(`“${intent.query}” için sipariş sonuçlarını gösteriyorum.`, [source("Siparişler", "/orders")]);
    case "find_customer": return reply(`“${intent.query}” için müşteri sonuçlarını gösteriyorum.`, [source("Müşteriler", "/customers")]);
    case "find_product": return reply(`“${intent.query}” için ürün sonuçlarını gösteriyorum.`, [source("Ürünler", "/products")]);
    case "navigate": {
      const destinations = {
        "/": ["Ana sayfayı açabilirsiniz.", "Ana sayfa"],
        "/products": ["Ürünler sayfasını açabilirsiniz.", "Ürünler"],
        "/orders": ["Siparişler sayfasını açabilirsiniz.", "Siparişler"],
        "/customers": ["Müşteriler sayfasını açabilirsiniz.", "Müşteriler"],
      } as const;
      const [text, label] = destinations[intent.destination];
      return reply(text, [source(label, intent.destination)]);
    }
    case "unsupported": return reply("Bu isteği yerel modda yapamıyorum. Yalnızca okuma ve gezinme komutlarını kullanabilirsiniz.");
  }
}
