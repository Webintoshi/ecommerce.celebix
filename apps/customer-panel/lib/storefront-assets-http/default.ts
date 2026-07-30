import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDefaultServerStorefrontAssetRuntime } from "../server-storefront-assets/default.ts";
import { createStorefrontAssetHttpHandlers } from "./handler.ts";

export const defaultStorefrontAssetHttpHandlers = createStorefrontAssetHttpHandlers({ resolveRuntime: resolveDefaultServerStorefrontAssetRuntime, now: () => new Date(), requestId: randomUUID });
