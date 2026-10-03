import type { CommandResult } from "./types";

export function moneyToCents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Tutarı en fazla iki ondalık basamakla girin.");
  const [whole, fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents <= 0n) throw new Error("Sıfırdan büyük geçerli bir tutar girin.");
  return Number(cents);
}

export function nonnegativeInteger(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error("Limitler sıfır veya pozitif tam sayı olmalıdır.");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Limit çok büyük.");
  return number;
}

export class CommandFailure extends Error {
  constructor(message: string, public status: number, public uncertain = false) { super(message); }
}

export type Attempt = { fingerprint: string; key: string };
export function commandAttempt(previous: Attempt | null, action: string, payload: Record<string, unknown>, expectedVersion: number, createKey = () => crypto.randomUUID()): Attempt {
  const fingerprint = JSON.stringify({ action, payload, expectedVersion });
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: createKey() };
}

export async function submitCommand(endpoint: string, action: string, payload: Record<string, unknown>, expectedVersion: number, key: string): Promise<CommandResult> {
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ action, payload, expectedVersion }) });
  } catch { throw new CommandFailure("Yanıt alınamadı. Sonuç belirsiz; aynı taslakla yeniden denediğinizde işlem anahtarı korunur.", 0, true); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Oturumunuz sona erdi. Yeniden giriş yapın; taslağınızı kapatmadan önce saklayın.",
      403: "Bu işlem için yetki veya iki adımlı doğrulama gerekiyor.",
      409: "Kayıt değişti veya bu işlem mevcut kayıtla çakışıyor. Güncel kaydı yükleyip taslağınızı kontrol edin.",
      422: "Bilgiler doğrulanamadı. Tutar, kullanım sınırları ve bekleyen işlemleri kontrol edin.",
      429: "Çok fazla deneme yapıldı. Biraz sonra aynı taslakla yeniden deneyin.",
      503: "Hizmete ulaşılamıyor. Taslağınız korunuyor; aynı işlemle yeniden deneyebilirsiniz.",
    };
    const returnedMessage = body?.error || body?.message;
    const safeMessage = typeof returnedMessage === "string" && !returnedMessage.includes("\n") && returnedMessage.length < 300 ? returnedMessage : undefined;
    throw new CommandFailure(safeMessage || messages[response.status] || "İşlem tamamlanamadı. Taslağınız korunuyor.", response.status, response.status >= 500);
  }
  if ((body?.outcome !== "committed" && body?.outcome !== "replayed") || !Number.isSafeInteger(body?.version) || body.version < 0 || !body.result || typeof body.result !== "object" || Array.isArray(body.result)) throw new CommandFailure("İşlem yanıtı doğrulanamadı. Aynı taslakla yeniden deneyin.", 0, true);
  return body as CommandResult;
}
