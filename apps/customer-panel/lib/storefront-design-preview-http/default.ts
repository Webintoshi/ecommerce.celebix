import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerStorefrontDesignPreviewRuntime } from "../server-storefront-design-preview/default.ts";
import { createStorefrontDesignPreviewHttpHandler } from "./handler-core.ts";

export const handleDefaultStorefrontDesignPreview = createStorefrontDesignPreviewHttpHandler({ resolveRuntime: resolveDefaultServerStorefrontDesignPreviewRuntime, now: () => new Date(), requestId: randomUUID });
