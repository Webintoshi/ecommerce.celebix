// Synthetic browser fixture only. No vault, merchant repository or provider network call.
const NOW = "2026-09-26T12:00:00.000Z";
const ID = "11111111-1111-4111-8111-111111111114";
const PROVIDER = Object.freeze({ provider: "deepseek", model: "deepseek-flash" });
type Message = { id: string; role: "user" | "assistant"; text: string; sources: { label: string; href: string }[]; createdAt: string };
type Conversation = { id: string; title: string; provider: string; model: string; version: number; createdAt: string; updatedAt: string; messages: Message[] };
const conversations = new Map<string, Conversation>([[ID, { id: ID, title: "Tarayıcı testi mağaza özeti", ...PROVIDER, version: 2, createdAt: NOW, updatedAt: NOW, messages: [
  { id: "22222222-2222-4222-8222-222222222224", role: "user", text: "Mağazamdaki ürünler ve siparişler nasıl?", sources: [], createdAt: NOW },
  { id: "33333333-3333-4333-8333-333333333334", role: "assistant", text: "Tarayıcı testi: 1 ürün ve 2 bekleyen sipariş var.\nStokta olmayan 1 varyant bulunuyor. Ürünler ve siparişler ekranından ayrıntıları kontrol edebilirsiniz.", sources: [{ label: "Ürünler", href: "/products" }, { label: "Siparişler", href: "/orders" }], createdAt: NOW },
] }]]);
const operations = new Map<string, { fingerprint: string; conversation: Conversation }>();

export function getToshiFixture(slug: string): Response | null {
  if (slug === "toshi/conversations") return Response.json({ conversations: [...conversations.values()].map(({ messages: _messages, ...summary }) => summary).reverse().slice(0, 20), defaultProvider: PROVIDER });
  if (slug.startsWith("toshi/conversations/")) { const value = conversations.get(slug.slice("toshi/conversations/".length)); return value ? Response.json({ conversation: value }) : Response.json({ code: "conversation_not_found" }, { status: 404 }); }
  return null;
}

export async function postToshiFixture(request: Request, slug: string): Promise<Response> {
  if (slug !== "toshi/messages") return Response.json({ code: "method_not_allowed" }, { status: 405 });
  const input = await request.json() as { conversationId: string | null; expectedVersion: number | null; text: string };
  const operationId = request.headers.get("idempotency-key") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(operationId) || !input.text?.trim() || input.text.length > 4000) return Response.json({ code: "invalid_input" }, { status: 400 });
  const fingerprint = JSON.stringify(input), previous = operations.get(operationId);
  if (previous) return previous.fingerprint === fingerprint ? Response.json({ conversation: previous.conversation }) : Response.json({ code: "operation_mismatch" }, { status: 409 });
  if (input.text.toLocaleLowerCase("tr-TR").includes("kota")) return Response.json({ code: "quota_exceeded" }, { status: 402 });
  if (input.text.toLocaleLowerCase("tr-TR").includes("bekle")) await new Promise((resolve) => setTimeout(resolve, 5000));
  const existing = input.conversationId ? conversations.get(input.conversationId) : undefined;
  if (input.conversationId && !existing) return Response.json({ code: "conversation_not_found" }, { status: 404 });
  if (existing && existing.version !== input.expectedVersion) return Response.json({ code: "version_conflict" }, { status: 409 });
  const current = existing ?? { id: crypto.randomUUID(), title: input.text.slice(0, 80), ...PROVIDER, version: 1, createdAt: NOW, updatedAt: NOW, messages: [] };
  const reply = input.text.toLocaleLowerCase("tr-TR").includes("biçim")
    ? "## Mağaza özeti\n\n**2 sipariş** işlem bekliyor.\n\n- Stokta olmayan varyantı kontrol edin.\n- Siparişlerin teslimat bilgilerini inceleyin.\n\n| Ürün | SKU | Stok |\n| --- | --- | ---: |\n| Günlük çanta | SRA-2026-01 | 12 |\n| Keten gömlek | SRA-2026-02 | 0 |\n\n### Sonraki adım\n\nİlgili ekranları aşağıdan açabilirsiniz. `SKU` ile ürün bulun.\n\n> Bu bir tarayıcı testi yanıtıdır; mağaza kaydı değiştirilmedi."
    : "Tarayıcı testi yanıtı: Önceki konuşma bağlamını koruyarak mağaza verilerini özetliyorum.\n2 bekleyen sipariş var. Ürün, stok ve mağaza satışı işlemlerini ilgili ekranlardan yapabilirsiniz; hiçbir kayıt değiştirilmedi.";
  const value: Conversation = { ...current, version: current.version + 1, messages: [...current.messages,
    { id: crypto.randomUUID(), role: "user", text: input.text, sources: [], createdAt: NOW },
    { id: crypto.randomUUID(), role: "assistant", text: reply, sources: [{ label: "Siparişler", href: "/orders" }, { label: "Mağaza satışı", href: "/orders/quick-links" }], createdAt: NOW },
  ] };
  conversations.set(value.id, value); operations.set(operationId, { fingerprint, conversation: value });
  return Response.json({ conversation: value });
}
