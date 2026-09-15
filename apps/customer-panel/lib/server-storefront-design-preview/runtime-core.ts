import type { StorefrontDesignRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import type { ServerStorefrontDesignPreviewLoader } from "./loader-core.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{ readiness: Readonly<{ mode: "approved_staging" }>; panelOrigin: string }>;

export type ServerStorefrontDesignPreviewRuntime = Readonly<{
  access: ApprovedAccess;
  design: Pick<StorefrontDesignRepository, "getWorkspace">;
  loader: ServerStorefrontDesignPreviewLoader;
}>;

function invalid(): never { throw new Error("server_storefront_design_preview_runtime_invalid"); }

export function createServerStorefrontDesignPreviewRuntime(input: Readonly<{
  access: ServerPanelAccessRuntime;
  design: Pick<StorefrontDesignRepository, "getWorkspace">;
  loader: ServerStorefrontDesignPreviewLoader;
}>): ServerStorefrontDesignPreviewRuntime {
  if (!input || input.access?.readiness.mode !== "approved_staging" || typeof input.access.panelOrigin !== "string" || typeof input.design?.getWorkspace !== "function" || typeof input.loader?.load !== "function") invalid();
  return Object.freeze({
    access: input.access as ApprovedAccess,
    design: Object.freeze({ getWorkspace: input.design.getWorkspace.bind(input.design) }),
    loader: Object.freeze({ load: input.loader.load.bind(input.loader) }),
  });
}
