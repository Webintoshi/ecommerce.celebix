import "server-only";

import type { ServerStorefrontDesignPreviewRuntime } from "./runtime-core.ts";

let runtime: ServerStorefrontDesignPreviewRuntime | null = null;

export function registerDefaultServerStorefrontDesignPreviewRuntime(value: ServerStorefrontDesignPreviewRuntime): void {
  if (runtime && runtime !== value) throw new Error("server_storefront_design_preview_runtime_already_registered");
  runtime = value;
}

export function registeredDefaultServerStorefrontDesignPreviewRuntime(): ServerStorefrontDesignPreviewRuntime | null { return runtime; }
