import "server-only";

import { parseCheckoutStatus, type CheckoutStatus } from "@celebix/saas-contracts";
import {
  PublicCheckoutRepositoryError,
  type PublicCheckoutRepository,
} from "@celebix/saas-data";

import {
  digestCartCredential,
  readCartCredential,
} from "../cart-capture/credential.ts";

export type CheckoutResultResolution =
  | Readonly<{ kind: "resolved"; status: CheckoutStatus }>
  | Readonly<{ kind: "not_found" | "unavailable" }>;

function publicRepositoryError(
  error: unknown,
): PublicCheckoutRepositoryError | null {
  try {
    return error instanceof PublicCheckoutRepositoryError ? error : null;
  } catch {
    return null;
  }
}

export async function resolveCheckoutResult(input: Readonly<{
  hostname: string;
  cookieHeader: string | null;
  now: Date;
  repository: Pick<PublicCheckoutRepository, "getStatus">;
}>): Promise<CheckoutResultResolution> {
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
    return Object.freeze({ kind: "unavailable" });
  }
  const selected = readCartCredential(input.cookieHeader);
  if (selected.kind !== "present") {
    return Object.freeze({ kind: "not_found" });
  }
  let credentialDigest: string;
  try {
    credentialDigest = digestCartCredential(selected.credential);
  } catch {
    return Object.freeze({ kind: "not_found" });
  }
  try {
    const status = parseCheckoutStatus(await input.repository.getStatus({
      hostname: input.hostname,
      credentialDigest,
      now: new Date(input.now),
    }));
    return Object.freeze({ kind: "resolved", status });
  } catch (error) {
    return Object.freeze({
      kind: publicRepositoryError(error)?.code === "not_found"
        ? "not_found"
        : "unavailable",
    });
  }
}
