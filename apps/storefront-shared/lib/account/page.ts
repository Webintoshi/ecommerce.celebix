import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveStorefrontPage } from "../page-context.ts";
import { requireStorefrontPage } from "../page-resolution.ts";
import { safeAccountReturnTo } from "./request.ts";

export async function resolveAccountPage(returnTo: string, allowProfileRequired = false) {
  const context = requireStorefrontPage(await resolveStorefrontPage()); const selected = safeAccountReturnTo(returnTo);
  if (!context.runtime.identity) redirect(`/account/login?returnTo=${encodeURIComponent(selected)}`);
  const session = await context.runtime.identity.session(context.storefront.hostname, (await cookies()).toString() || null).catch(() => ({ outcome: "unauthenticated" as const }));
  if (session.outcome === "unauthenticated") redirect(`/account/login?returnTo=${encodeURIComponent(selected)}`);
  if (session.outcome === "profile_required" && !allowProfileRequired) redirect("/account/profile");
  return Object.freeze({ ...context, identity: context.runtime.identity, session });
}
