import "server-only";
import type { ProductMediaRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import type { ProductMediaStorage } from "./r2-storage.ts";

export type ServerMediaRuntime = Readonly<{
  access: ServerPanelAccessRuntime & Readonly<{ readiness: Readonly<{ mode: "approved_staging" }>; panelOrigin: string }>;
  media: ProductMediaRepository;
  storage: ProductMediaStorage;
}>;

export function createServerMediaRuntime(input: Readonly<{ access: ServerPanelAccessRuntime; media: ProductMediaRepository; storage: ProductMediaStorage }>): ServerMediaRuntime {
  if (!input || input.access.readiness.mode !== "approved_staging" || typeof input.access.panelOrigin !== "string" || !input.media || !input.storage) throw new Error("server_media_runtime_invalid");
  return Object.freeze({ access: input.access as ServerMediaRuntime["access"], media: input.media, storage: input.storage });
}
