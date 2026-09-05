import "server-only";

import type { PromotionRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccessRuntime = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerPromotionsRuntime = Readonly<{
  access: ApprovedAccessRuntime;
  promotions: PromotionRepository;
}>;

const METHODS = Object.freeze([
  "list", "detail", "create", "update", "publish", "pause", "resume", "duplicate", "archive",
  "simulate", "conflicts", "margin", "listTargets", "resolveTargets", "createCodeBatch",
  "updateCodeBatchStatus", "listCodeBatches", "exportCodes", "analytics", "listLegacy",
] as const);
const repositories = new WeakMap<ServerPanelAccessRuntime, PromotionRepository>();

function invalid(): never { throw new Error("server_promotions_runtime_invalid"); }

function facade(repository: PromotionRepository): PromotionRepository {
  try {
    if (!repository || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
    return Object.freeze(Object.fromEntries(
      METHODS.map((method) => [method, repository[method].bind(repository)]),
    )) as unknown as PromotionRepository;
  } catch { return invalid(); }
}

export function registerServerPromotionsRepository(
  access: ServerPanelAccessRuntime,
  repository: PromotionRepository,
): void {
  try {
    if (
      !access || access.readiness.mode !== "approved_staging" ||
      access.panelOrigin === null || repositories.has(access)
    ) invalid();
    repositories.set(access, facade(repository));
  } catch { invalid(); }
}

export function resolveServerPromotionsRuntime(access: ServerPanelAccessRuntime): ServerPromotionsRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    const promotions = repositories.get(access);
    return promotions === undefined
      ? null
      : Object.freeze({ access: access as ApprovedAccessRuntime, promotions });
  } catch { return null; }
}
