import type { NewsletterSubscribeInput } from "@celebix/saas-contracts";
import type { NewsletterRepository } from "@celebix/saas-data";

import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { parseNewsletterSubscribeRequest } from "./request.ts";

const CONSENT_VERSION = "starter-v1";

type ProcessDependencies = Readonly<{
  repository: Pick<NewsletterRepository, "subscribe">;
  now(): Date;
}>;

type RouteDependencies = Readonly<{
  selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRepository(): Promise<NewsletterRepository | null>;
  now(): Date;
}>;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function processNewsletterSubscription(
  dependencies: ProcessDependencies,
  hostname: string,
  input: NewsletterSubscribeInput,
): Promise<Readonly<{ outcome: "subscribed" }>> {
  const now = dependencies.now();
  if (!(now instanceof Date) || Object.getPrototypeOf(now) !== Date.prototype || !Number.isFinite(now.getTime())) throw new TypeError("storefront_newsletter_unavailable");
  const result = await dependencies.repository.subscribe({ hostname, now: new Date(now), email: input.email, consentVersion: CONSENT_VERSION });
  if (!result || result.outcome !== "subscribed" || Object.keys(result).join(",") !== "outcome") throw new TypeError("storefront_newsletter_unavailable");
  return Object.freeze({ outcome: "subscribed" });
}

export function createNewsletterSubscribeRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    let authority: TrustedStorefrontHostAuthority;
    try { authority = dependencies.selectAuthority(request.headers); } catch { return json({ code: "unavailable" }, 503); }
    if (authority.kind !== "trusted") return json({ code: "unavailable" }, 503);
    let input: NewsletterSubscribeInput;
    try { input = await parseNewsletterSubscribeRequest(request, `https://${authority.hostname}`); }
    catch { return json({ code: "invalid_input" }, 400); }
    let repository: NewsletterRepository | null;
    try { repository = await dependencies.resolveRepository(); } catch { repository = null; }
    if (!repository) return json({ code: "unavailable" }, 503);
    try {
      const result = await processNewsletterSubscription({ repository, now: dependencies.now }, authority.hostname, input);
      return json(result, 200);
    } catch {
      return json({ code: "unavailable" }, 503);
    }
  };
}
