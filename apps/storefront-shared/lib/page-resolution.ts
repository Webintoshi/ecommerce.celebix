import { notFound } from "next/navigation";
import type { StorefrontPageContext, StorefrontPageResolution } from "./page-context.ts";

export class StorefrontUnavailableError extends Error { constructor() { super("storefront_unavailable"); this.name = "StorefrontUnavailableError"; } }
export function requireStorefrontPage(result: StorefrontPageResolution): StorefrontPageContext {
  if (result.kind === "not_found") notFound();
  if (result.kind === "unavailable") throw new StorefrontUnavailableError();
  return result.context;
}
