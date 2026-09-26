import "server-only";
import type { ToshiConversationRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { resolveServerToshiProviderRuntime } from "../server-toshi-providers/runtime.ts";
import { createToshiGenerationRegistry } from "../toshi-generation/registry.ts";
import type { ToshiGenerationRegistry } from "../toshi-generation/types.ts";
import { createToshiChatService, type ToshiChatService } from "./service.ts";
import type { ToshiToolRepositories } from "./tools.ts";

export type ServerToshiChatRuntime = Readonly<{ access: ServerPanelAccessRuntime & Readonly<{ panelOrigin: string }>; service: ToshiChatService }>;
const RUNTIMES = new WeakMap<ServerPanelAccessRuntime, ServerToshiChatRuntime>();
export function registerServerToshiChatRuntime(access: ServerPanelAccessRuntime, conversations: ToshiConversationRepository, repositories: ToshiToolRepositories, generations: ToshiGenerationRegistry = createToshiGenerationRegistry()): ServerToshiChatRuntime {
  const providerRuntime = resolveServerToshiProviderRuntime(access);
  if (!providerRuntime || RUNTIMES.has(access) || !conversations || ["list", "get", "beginTurn", "completeTurn", "failTurn"].some(method => typeof conversations[method as keyof ToshiConversationRepository] !== "function")) throw Error("server_toshi_chat_runtime_invalid");
  const runtime = Object.freeze({ access: providerRuntime.access, service: createToshiChatService({ conversations, providers: providerRuntime.repository, keyring: () => providerRuntime.keyring, generations, repositories: Object.freeze({ ...repositories }), now: () => new Date() }) });
  RUNTIMES.set(access, runtime); return runtime;
}
export function resolveServerToshiChatRuntime(access: ServerPanelAccessRuntime): ServerToshiChatRuntime | null {
  return access?.readiness.mode === "approved_staging" && access.panelOrigin !== null ? RUNTIMES.get(access) ?? null : null;
}
