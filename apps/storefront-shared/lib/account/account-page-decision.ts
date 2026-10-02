import { accountProfileCompletionDestination, safeAccountReturnTo } from "./request.ts";

type Outcome = "found" | "profile_required" | "unauthenticated";

export function accountLoginDestination(outcome: Outcome, returnTo: unknown): string | null {
  const target = safeAccountReturnTo(returnTo);
  if (outcome === "profile_required") return accountProfileCompletionDestination(target);
  if (outcome === "found") return target === "/account/login" ? "/account" : target;
  return null;
}

export function accountProfileDestination(outcome: Outcome, returnTo: unknown): string | null {
  if (outcome !== "found" || typeof returnTo !== "string" || safeAccountReturnTo(returnTo) !== returnTo) return null;
  return returnTo === "/account/profile" ? "/account" : returnTo;
}
