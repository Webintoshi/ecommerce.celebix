import { validateAccountAuthDestination } from "../../lib/account/request.ts";

export type AccountAuthPublicResponse = Readonly<{
  returnTo?: string;
  destination?: string;
  message?: string;
  retryAfterSeconds?: number;
  deliveryRequired?: boolean;
}>;

export class AccountAuthRequestError extends Error {
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "AccountAuthRequestError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function postAccountAuth(path: "/api/account/auth/verify", body: unknown, transport?: typeof fetch): Promise<AccountAuthPublicResponse & Readonly<{ destination: string }>>;
export function postAccountAuth(path: "/api/account/auth/start", body: unknown, transport?: typeof fetch): Promise<AccountAuthPublicResponse>;
export async function postAccountAuth(path: "/api/account/auth/start" | "/api/account/auth/verify", body: unknown, transport: typeof fetch = fetch): Promise<AccountAuthPublicResponse> {
  const response = await transport(path, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const raw = await response.json().catch(() => null) as unknown;
  const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as AccountAuthPublicResponse : null;
  if (!response.ok || !payload) {
    throw new AccountAuthRequestError(typeof payload?.message === "string" ? payload.message : "İşlem tamamlanamadı.", payload?.retryAfterSeconds);
  }
  if (path === "/api/account/auth/verify" && validateAccountAuthDestination(payload.destination) === null) {
    throw new AccountAuthRequestError("İşlem tamamlanamadı.");
  }
  return payload;
}

export async function startAccountPhoneChallenge(body: Readonly<{ phone: string; firstName?: string; lastName?: string; returnTo: string }>, transport: typeof fetch = fetch): Promise<AccountAuthPublicResponse> {
  const payload = await postAccountAuth("/api/account/auth/start", body, transport);
  if (payload.deliveryRequired !== true) throw new AccountAuthRequestError("Kod gönderilemedi. Lütfen tekrar deneyin.", payload.retryAfterSeconds);
  return payload;
}
