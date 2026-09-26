import {
  parseToshiConversation,
  parseToshiConversationListResponse,
  type ToshiConversation,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Forty public messages can contain up to 1.28 MB of valid UTF-8 text plus sources.
const MAX_RESPONSE_BYTES = 2_097_152;
const ERROR_MESSAGES = Object.freeze({
  invalid_input: "Sorunuzu kontrol edin. En fazla 4000 karakter yazabilirsiniz.",
  sensitive_input: "API anahtarı veya parola yazmayın. Bağlantıyı Ayarlar → Yapay Zeka ekranından kurun.",
  unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.",
  membership_denied: "Bu mağaza bilgilerine erişim yetkiniz yok.",
  origin_denied: "Güvenlik doğrulaması başarısız oldu. Sayfayı yenileyin.",
  store_inactive: "Mağaza şu anda aktif değil.",
  feature_not_enabled: "Toshi bu mağazada etkin değil.",
  connection_missing: "Yapay zekâ bağlantısı yok. Ayarlardan bir sağlayıcı bağlayın.",
  connection_revoked: "Bu konuşmanın bağlantısı kaldırılmış. Aktif bağlantıyla yeni konuşma başlatın.",
  credential_invalid: "API anahtarı kullanılamıyor. Yapay zekâ ayarlarından bağlantıyı yenileyin.",
  model_unavailable: "Bu model kullanılamıyor. Ayarlardan model seçip yeni konuşma başlatın.",
  quota_exceeded: "Sağlayıcı hesabının bakiyesi veya kotası yetersiz. Sağlayıcıdaki faturalamayı kontrol edin.",
  rate_limited: "İstek sınırına ulaşıldı. Biraz bekleyip yeniden gönderin.",
  provider_timeout: "Sağlayıcı zamanında yanıt vermedi. Sorunuz korundu; yeniden gönderebilirsiniz.",
  provider_unavailable: "Sağlayıcı şu anda yanıt veremiyor. Sorunuz korundu; biraz sonra yeniden gönderin.",
  busy: "Bir yanıt hazırlanıyor. Son gönderimin sonucunu kontrol edin.",
  context_limit: "Bu konuşma sınırına ulaştı. Yeni konuşma başlatın.",
  version_conflict: "Konuşma başka bir yerde güncellendi. Geçmişi yenileyip sorunuzu yeniden gönderin.",
  conversation_not_found: "Konuşma bulunamadı. Yeni konuşma başlatabilirsiniz.",
  operation_mismatch: "Gönderim güvenle tekrarlanamadı. Konuşma geçmişini kontrol edin.",
  operation_not_found: "Gönderim kaydı bulunamadı. Konuşma geçmişini kontrol edin.",
  operation_failed: "Bu gönderim tamamlanamadı. Sorunuz korundu; yeniden gönderebilirsiniz.",
  durable_authority_invalid: "Mağaza yetkisi yenilenmeli. Sayfayı yenileyin.",
  cancelled: "Yanıt hazırlanması durduruldu. Sorunuz korundu.",
  unavailable: "Gönderim sonucu doğrulanamadı. Yanıtı kontrol edin; sorunuz korundu.",
});

export type ToshiChatErrorCode = keyof typeof ERROR_MESSAGES;

export class ToshiChatApiError extends Error {
  readonly code: ToshiChatErrorCode;
  readonly uncertain: boolean;
  constructor(code: ToshiChatErrorCode = "unavailable", uncertain = code === "unavailable" || code === "busy") {
    super(ERROR_MESSAGES[code]);
    this.name = "ToshiChatApiError";
    this.code = code;
    this.uncertain = uncertain;
  }
}

export type ToshiSendInput = Readonly<{ conversationId: string | null; expectedVersion: number | null; text: string }>;
export interface ToshiChatApi {
  list(signal?: AbortSignal): Promise<ReturnType<typeof parseToshiConversationListResponse>>;
  get(id: string, signal?: AbortSignal): Promise<ToshiConversation>;
  send(input: ToshiSendInput, operationId: string, signal?: AbortSignal): Promise<ToshiConversation>;
}

function exact(value: unknown, keys: string): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join(",") === keys ? value as Record<string, unknown> : null;
}
function invalid(): never { throw new ToshiChatApiError("invalid_input", false); }
function id(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }

async function json(response: Response): Promise<unknown> {
  if (!(response instanceof Response) || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new ToshiChatApiError();
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) throw new ToshiChatApiError();
  const reader = response.body?.getReader();
  if (!reader) throw new ToshiChatApiError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let bytes: Uint8Array | undefined;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { chunk.value.fill(0); await reader.cancel(); throw new ToshiChatApiError(); }
      chunks.push(chunk.value);
    }
    bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ToshiChatApiError();
  } finally {
    reader.releaseLock(); bytes?.fill(0); for (const chunk of chunks) chunk.fill(0);
  }
}

export function createToshiChatApi(fetcher: typeof fetch = fetch): ToshiChatApi {
  if (typeof fetcher !== "function") invalid();
  async function request<T>(path: string, parser: (value: unknown) => T, init: RequestInit): Promise<T> {
    let response: Response;
    try { response = await fetcher(path, { credentials: "same-origin", cache: "no-store", ...init }); }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw error; throw new ToshiChatApiError(); }
    const value = await json(response);
    if (!response.ok) {
      const failure = exact(value, "code");
      const code = typeof failure?.code === "string" && Object.hasOwn(ERROR_MESSAGES, failure.code) ? failure.code as ToshiChatErrorCode : "unavailable";
      throw new ToshiChatApiError(code);
    }
    try { return parser(value); } catch { throw new ToshiChatApiError(); }
  }
  function conversation(value: unknown): ToshiConversation {
    const envelope = exact(value, "conversation");
    if (!envelope) throw new ToshiChatApiError();
    return parseToshiConversation(envelope.conversation);
  }
  return Object.freeze({
    list(signal?: AbortSignal) { return request("/api/toshi/conversations", parseToshiConversationListResponse, { method: "GET", headers: { accept: "application/json" }, signal }); },
    get(value: string, signal?: AbortSignal) { return request(`/api/toshi/conversations/${id(value)}`, conversation, { method: "GET", headers: { accept: "application/json" }, signal }); },
    send(input: ToshiSendInput, operationId: string, signal?: AbortSignal) {
      const record = exact(input, "conversationId,expectedVersion,text");
      if (!record || (input.conversationId === null ? input.expectedVersion !== null : !UUID.test(input.conversationId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion! < 0) || typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(input.text)) invalid();
      return request("/api/toshi/messages", conversation, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", "idempotency-key": id(operationId) }, body: JSON.stringify(input), signal });
    },
  });
}
