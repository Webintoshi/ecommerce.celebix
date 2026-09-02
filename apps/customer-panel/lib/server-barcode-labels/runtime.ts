import "server-only";
import type { BarcodeLabelRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type Approved = ServerPanelAccessRuntime &
  Readonly<{
    readiness: Readonly<{ mode: "approved_staging" }>;
    panelOrigin: string;
  }>;
export type ServerBarcodeLabelRuntime = Readonly<{
  access: Approved;
  barcodeLabels: BarcodeLabelRepository;
}>;
const repositories = new WeakMap<
  ServerPanelAccessRuntime,
  BarcodeLabelRepository
>();
const METHODS = Object.freeze([
  "list",
  "listTemplates",
  "saveTemplate",
  "archiveTemplate",
  "generateInternal",
  "listJobs",
  "createJob",
  "getJob",
] as const);
function invalid(): never {
  throw new Error("server_barcode_label_runtime_invalid");
}
function facade(repository: BarcodeLabelRepository): BarcodeLabelRepository {
  if (
    !repository ||
    METHODS.some((method) => typeof repository[method] !== "function")
  )
    invalid();
  return Object.freeze(
    Object.fromEntries(
      METHODS.map((method) => [method, repository[method].bind(repository)]),
    ),
  ) as unknown as BarcodeLabelRepository;
}
export function registerServerBarcodeLabelRepository(
  access: ServerPanelAccessRuntime,
  repository: BarcodeLabelRepository,
): void {
  if (
    !access ||
    access.readiness.mode !== "approved_staging" ||
    access.panelOrigin === null ||
    repositories.has(access)
  )
    invalid();
  repositories.set(access, facade(repository));
}
export function resolveServerBarcodeLabelRuntime(
  access: ServerPanelAccessRuntime,
): ServerBarcodeLabelRuntime | null {
  if (
    !access ||
    access.readiness.mode !== "approved_staging" ||
    access.panelOrigin === null
  )
    return null;
  const barcodeLabels = repositories.get(access);
  return barcodeLabels
    ? Object.freeze({ access: access as Approved, barcodeLabels })
    : null;
}
