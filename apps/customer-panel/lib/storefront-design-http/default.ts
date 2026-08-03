import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerStorefrontDesignRuntime } from "../server-storefront-design/default.ts";
import { createStorefrontDesignHttpHandlers } from "./handler.ts";

const handlers = createStorefrontDesignHttpHandlers({ resolveRuntime: resolveDefaultServerStorefrontDesignRuntime, now: () => new Date(), requestId: randomUUID, uuid: randomUUID });

export const handleDefaultStorefrontDesignWorkspace = handlers.workspace;
export const handleDefaultStorefrontDesignSaveDraft = handlers.saveDraft;
export const handleDefaultStorefrontDesignPublish = handlers.publish;
export const handleDefaultStorefrontDesignMediaUpload = handlers.uploadMedia;
