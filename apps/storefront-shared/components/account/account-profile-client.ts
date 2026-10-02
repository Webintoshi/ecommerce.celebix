import { safeAccountReturnTo } from "../../lib/account/request.ts";

export type AccountProfileAttempt = Readonly<{ operationId: string; firstName: string; lastName: string; returnTo?: string }>;
type AccountProfileFields = Readonly<{ firstName: string; lastName: string; returnTo?: string }>;
export type AccountProfileCompletionResult = Readonly<
  | { kind: "redirect"; destination: string }
  | { kind: "retry"; message: string }
  | { kind: "reverify"; href: string }
  | { kind: "error"; message: string }
>;

const RETRY_MESSAGE = "Bağlantı kesildi. Bilgileriniz duruyor; tekrar deneyin.";
const LOOKUP_MESSAGE = "Hesap durumunuz doğrulanamadı. Bilgileriniz duruyor; tekrar deneyin.";

export function createAccountProfileAttempt(previous: AccountProfileAttempt | null, fields: AccountProfileFields, newOperationId: () => string): AccountProfileAttempt {
  const returnTo = safeAccountReturnTo(fields.returnTo);
  if (previous && previous.firstName === fields.firstName && previous.lastName === fields.lastName && safeAccountReturnTo(previous.returnTo) === returnTo) return previous;
  return Object.freeze({ operationId: newOperationId(), firstName: fields.firstName, lastName: fields.lastName, ...(fields.returnTo === undefined ? {} : { returnTo }) });
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function payload(response: Response): Promise<Record<string, unknown> | null> {
  try { return object(await response.json()); } catch { return null; }
}

export async function completeAccountProfile(attempt: AccountProfileAttempt, csrfToken: string, transport: typeof fetch): Promise<AccountProfileCompletionResult> {
  try {
    const response = await transport("/api/account/profile/complete", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json", "x-celebix-account-csrf": csrfToken },
      body: JSON.stringify(attempt),
    });
    const result = await payload(response);
    const knownRejection = response.status === 400 || response.status === 409 || (response.status === 403 && result?.code === "account_suspended");
    if (!response.ok && knownRejection && typeof result?.message === "string") {
      return { kind: "error", message: result.message };
    }
  } catch {
    // A transport error can occur after the server has committed the profile.
  }

  try {
    const session = await transport("/api/account/session", { method: "GET", credentials: "same-origin", cache: "no-store" });
    const result = session.ok ? await payload(session) : null;
    if (result?.outcome === "found") return { kind: "redirect", destination: safeAccountReturnTo(attempt.returnTo) };
    if (result?.outcome === "profile_required") return { kind: "retry", message: RETRY_MESSAGE };
    if (result?.outcome === "unauthenticated") return { kind: "reverify", href: `/account/login?returnTo=${encodeURIComponent(safeAccountReturnTo(attempt.returnTo))}` };
  } catch {
    // Keep the form intact if the account state cannot be checked.
  }
  return { kind: "error", message: LOOKUP_MESSAGE };
}
