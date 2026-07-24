import type {
  AbandonedCartSummary,
  CustomerListItem,
  CustomerSummary,
  OrderDashboardSummary,
  OrderListItem,
  Product,
} from "@celebix/saas-contracts";

import type { ToshiLocalIntent, ToshiLocalReply, ToshiLocalSource } from "./types.ts";

type CatalogSummary = Readonly<{
  totalProducts: number;
  outOfStockVariants: number;
}>;

type StoreSummary = Readonly<{
  catalog: CatalogSummary;
  orders: OrderDashboardSummary;
  customers: CustomerSummary;
  abandoned: AbandonedCartSummary;
}>;

type ProductSearch = Readonly<{
  products: readonly Product[];
  truncated: boolean;
}>;

function source(label: string, href: ToshiLocalSource["href"]): ToshiLocalSource {
  return Object.freeze({ label, href });
}

function reply(text: string, sources: readonly ToshiLocalSource[] = []): ToshiLocalReply {
  return Object.freeze({ text, sources: Object.freeze([...sources]) });
}

export function projectToshiLocalReply(intent: ToshiLocalIntent, payload: unknown): ToshiLocalReply {
  switch (intent.kind) {
    case "store_summary": {
      const summary = payload as StoreSummary;
      return reply(
        `Mağazada ${summary.catalog.totalProducts} ürün, ${summary.orders.pendingOrders} bekleyen sipariş, ${summary.customers.active} aktif müşteri ve ${summary.abandoned.abandoned} terk edilmiş sepet var.`,
        [source("Mağaza özeti", "/")],
      );
    }
    case "pending_orders": {
      const summary = payload as OrderDashboardSummary;
      return reply(`${summary.pendingOrders} bekleyen sipariş var.`, [source("Siparişler", "/orders")]);
    }
    case "low_stock": {
      const summary = payload as CatalogSummary;
      return reply(`Stokta olmayan ${summary.outOfStockVariants} varyant var.`, [source("Ürünler", "/products")]);
    }
    case "find_order": {
      const orders = payload as readonly OrderListItem[];
      return searchReply(intent.query, "sipariş", orders.map((order) => `${order.orderNumber} (${order.customerName})`), "Siparişler", "/orders");
    }
    case "find_customer": {
      const customers = payload as readonly CustomerListItem[];
      return searchReply(intent.query, "müşteri", customers.map((customer) => customer.displayName), "Müşteriler", "/customers");
    }
    case "find_product": {
      const search = payload as ProductSearch;
      return productSearchReply(intent.query, search.products.map((product) => product.title), search.truncated);
    }
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

function productSearchReply(query: string, products: readonly string[], truncated: boolean): ToshiLocalReply {
  const text = products.length === 0
    ? `“${query}” için eşleşme bulunamadı${truncated ? "; daha fazla ürün olabilir" : ""}.`
    : `“${query}” için ilk ${products.length} eşleşme: ${products.join(", ")}.${truncated ? " Daha fazla ürün olabilir." : ""}`;
  return reply(text, [source("Ürünler", "/products")]);
}

function searchReply(
  query: string,
  label: string,
  values: readonly string[],
  sourceLabel: string,
  href: ToshiLocalSource["href"],
): ToshiLocalReply {
  const count = values.length;
  const text = count === 0
    ? `“${query}” için ${label} bulunamadı.`
    : `“${query}” için ${count} ${label} bulundu: ${values.join(", ")}.`;
  return reply(text, [source(sourceLabel, href)]);
}
