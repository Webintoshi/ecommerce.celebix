import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerToshiChatRuntime } from "../server-toshi-chat/runtime.ts";
import { createToshiChatHttpHandlers, type ToshiConversationRouteContext } from "./handler.ts";
const handlers = createToshiChatHttpHandlers({ resolveRuntime: async () => resolveServerToshiChatRuntime(await resolveDefaultServerPanelAccessRuntime()), now: () => new Date(), requestId: randomUUID });
export const handleToshiConversationList = (request: Request) => handlers.list(request);
export const handleToshiConversationGet = (request: Request, context: ToshiConversationRouteContext) => handlers.get(request, context);
export const handleToshiMessageSend = (request: Request) => handlers.send(request);
