import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDefaultServerMediaRuntime } from "../server-media/default.ts";
import { createProductMediaHttpHandlers } from "./handler.ts";
export const defaultProductMediaHttpHandlers = createProductMediaHttpHandlers({ resolveRuntime: resolveDefaultServerMediaRuntime, now: () => new Date(), requestId: randomUUID });
