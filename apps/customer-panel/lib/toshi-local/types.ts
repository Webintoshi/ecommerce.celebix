export type ToshiDestination = "/" | "/products" | "/orders" | "/customers";

export type ToshiLocalIntent =
  | { readonly kind: "store_summary" }
  | { readonly kind: "pending_orders" }
  | { readonly kind: "low_stock" }
  | { readonly kind: "find_order"; readonly query: string }
  | { readonly kind: "find_customer"; readonly query: string }
  | { readonly kind: "find_product"; readonly query: string }
  | { readonly kind: "navigate"; readonly destination: ToshiDestination }
  | { readonly kind: "unsupported" };

export type ToshiLocalSource = Readonly<{
  label: string;
  href: ToshiDestination;
}>;

export type ToshiLocalReply = Readonly<{
  text: string;
  sources: readonly ToshiLocalSource[];
}>;
