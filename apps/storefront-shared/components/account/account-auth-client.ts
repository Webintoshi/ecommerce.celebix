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
  readonly code:string|undefined;

  constructor(message: string, retryAfterSeconds?: number,code?:string) {
    super(message);
    this.name = "AccountAuthRequestError";
    this.retryAfterSeconds = retryAfterSeconds;this.code=code;
  }
}

function accountCsrfCookie(): string {
  if (typeof document === "undefined") return "";
  const values = document.cookie.split(";").map((part) => part.trim()).filter((part) => part.startsWith("__Host-celebix_account_csrf=")).map((part) => part.slice("__Host-celebix_account_csrf=".length));
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/u.test(values[0]!) ? values[0]! : "";
}

export function postAccountAuth(path: "/api/account/auth/verify", body: unknown, transport?: typeof fetch): Promise<AccountAuthPublicResponse & Readonly<{ destination: string }>>;
export function postAccountAuth(path: "/api/account/auth/start", body: unknown, transport?: typeof fetch): Promise<AccountAuthPublicResponse>;
export async function postAccountAuth(path: "/api/account/auth/start" | "/api/account/auth/verify", body: unknown, transport: typeof fetch = fetch): Promise<AccountAuthPublicResponse> {
  if(!body||typeof body!=="object"||Array.isArray(body))throw new AccountAuthRequestError("İşlem tamamlanamadı.");
  const row=body as Record<string,unknown>,operationId=row.operationId??crypto.randomUUID();
  if(typeof operationId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(operationId))throw new AccountAuthRequestError("İşlem tamamlanamadı.");
  const payloadBody={...row,operationId};
  const headers: Record<string, string> = { "content-type": "application/json","idempotency-key":operationId };
  if (path === "/api/account/auth/start" && body && typeof body === "object" && (body as { bindPhone?: unknown }).bindPhone === true) headers["x-celebix-account-csrf"] = accountCsrfCookie();
  const response = await transport(path, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers, body: JSON.stringify(payloadBody),
  });
  const raw = await response.json().catch(() => null) as unknown;
  const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as AccountAuthPublicResponse : null;
  if (!response.ok || !payload) {
    throw new AccountAuthRequestError(typeof payload?.message === "string" ? payload.message : "İşlem tamamlanamadı.", payload?.retryAfterSeconds,typeof (payload as {code?:unknown})?.code==='string'?(payload as {code:string}).code:undefined);
  }
  if (path === "/api/account/auth/verify" && validateAccountAuthDestination(payload.destination) === null) {
    throw new AccountAuthRequestError("İşlem tamamlanamadı.");
  }
  return payload;
}

export async function startAccountPhoneChallenge(body: Readonly<{ operationId?:string;phone: string; firstName?: string; lastName?: string; returnTo: string; bindPhone?: true }>, transport: typeof fetch = fetch): Promise<AccountAuthPublicResponse> {
  const payload = await postAccountAuth("/api/account/auth/start", body, transport);
  if (payload.deliveryRequired !== true) throw new AccountAuthRequestError("Kod gönderilemedi. Lütfen tekrar deneyin.", payload.retryAfterSeconds);
  return payload;
}
