import {
  serializeCanonicalPaytrConfiguration,
  type CanonicalPaytrConfiguration,
  type QuickLinkKeyring,
  type QuickOrderLinkRepository,
  type QuickOrderPrivateRepository,
} from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccessRuntime = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerQuickLinksRuntime = Readonly<{
  access: ApprovedAccessRuntime;
  links: QuickOrderLinkRepository;
  privateLinks: QuickOrderPrivateRepository;
  keyring: QuickLinkKeyring;
  paytrConfiguration: CanonicalPaytrConfiguration;
}>;

type Registration = Omit<ServerQuickLinksRuntime, "access">;

const runtimes = new WeakMap<ServerPanelAccessRuntime, Registration>();
const LINK_METHODS = Object.freeze(["list", "get", "create", "cancel", "duplicate"] as const);
const PRIVATE_METHODS = Object.freeze([
  "getProviderReadiness", "configureProvider", "revokeProvider", "revealLinkCredential", "revealProviderConfiguration",
] as const);

function invalid(): never {
  throw new Error("server_quick_links_runtime_invalid");
}

function validateKeyring(keyring: QuickLinkKeyring): void {
  if (
    !keyring || typeof keyring !== "object" || typeof keyring.activeKeyId !== "string" ||
    !Array.isArray(keyring.keys) || keyring.keys.length < 1 || keyring.keys.length > 64
  ) invalid();
  const ids = new Set<string>();
  let active = false;
  for (const selected of keyring.keys) {
    if (
      !selected || typeof selected !== "object" || typeof selected.keyId !== "string" || ids.has(selected.keyId) ||
      !(selected.key instanceof Uint8Array) || selected.key.byteLength !== 32
    ) invalid();
    ids.add(selected.keyId);
    if (selected.keyId === keyring.activeKeyId) active = true;
  }
  if (!active) invalid();
}

function linksFacade(repository: QuickOrderLinkRepository): QuickOrderLinkRepository {
  if (!repository || LINK_METHODS.some((method) => typeof repository[method] !== "function")) invalid();
  const projected: QuickOrderLinkRepository = {
    list: (input) => repository.list(input),
    get: (input) => repository.get(input),
    create: (input) => repository.create(input),
    cancel: (input) => repository.cancel(input),
    duplicate: (input) => repository.duplicate(input),
  };
  return Object.freeze(projected);
}

function privateFacade(repository: QuickOrderPrivateRepository): QuickOrderPrivateRepository {
  if (!repository || PRIVATE_METHODS.some((method) => typeof repository[method] !== "function")) invalid();
  const projected: QuickOrderPrivateRepository = {
    getProviderReadiness: (input) => repository.getProviderReadiness(input),
    configureProvider: (input) => repository.configureProvider(input),
    revokeProvider: (input) => repository.revokeProvider(input),
    revealLinkCredential: (input) => repository.revealLinkCredential(input),
    revealProviderConfiguration: (input) => repository.revealProviderConfiguration(input),
  };
  return Object.freeze(projected);
}

export function registerServerQuickLinksRuntime(
  access: ServerPanelAccessRuntime,
  dependencies: Registration,
): void {
  try {
    if (
      !access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null ||
      runtimes.has(access) || !dependencies || typeof dependencies !== "object"
    ) invalid();
    validateKeyring(dependencies.keyring);
    serializeCanonicalPaytrConfiguration(dependencies.paytrConfiguration);
    runtimes.set(access, Object.freeze({
      links: linksFacade(dependencies.links),
      privateLinks: privateFacade(dependencies.privateLinks),
      keyring: dependencies.keyring,
      paytrConfiguration: dependencies.paytrConfiguration,
    }));
  } catch { invalid(); }
}

export function resolveServerQuickLinksRuntime(access: ServerPanelAccessRuntime): ServerQuickLinksRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    const selected = runtimes.get(access);
    return selected === undefined
      ? null
      : Object.freeze({ access: access as ApprovedAccessRuntime, ...selected });
  } catch { return null; }
}
