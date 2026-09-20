import "server-only";

import { resolveDefaultServerStorefrontDesignRuntime } from "../server-storefront-design/default.ts";
import { registeredDefaultServerStorefrontDesignPreviewRuntime } from "./registry.ts";
import type { ServerStorefrontDesignPreviewRuntime } from "./runtime-core.ts";

export async function resolveDefaultServerStorefrontDesignPreviewRuntime(): Promise<ServerStorefrontDesignPreviewRuntime | null> {
  if (!await resolveDefaultServerStorefrontDesignRuntime()) return null;
  return registeredDefaultServerStorefrontDesignPreviewRuntime();
}
