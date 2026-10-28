import type { ToshiCreditRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
export type ServerToshiCreditsRuntime = Readonly<{
  access: ServerPanelAccessRuntime & Readonly<{ panelOrigin: string }>;
  repository: ToshiCreditRepository;
}>;
const RUNTIMES = new WeakMap<ServerPanelAccessRuntime, ServerToshiCreditsRuntime>();
const METHODS = ['getWallet', 'reserve', 'complete', 'fail'] as const;
export function registerServerToshiCreditsRuntime(access: ServerPanelAccessRuntime, repository: ToshiCreditRepository): ServerToshiCreditsRuntime {
  if (!access || access.readiness.mode !== 'approved_staging' || !access.panelOrigin || RUNTIMES.has(access) || !repository || METHODS.some(method => typeof repository[method] !== 'function')) throw TypeError('server_toshi_credits_runtime_invalid');
  const facade = Object.freeze(Object.fromEntries(METHODS.map(method => [method, repository[method].bind(repository)])) as unknown as ToshiCreditRepository);
  const runtime = Object.freeze({ access: access as ServerToshiCreditsRuntime['access'], repository: facade });
  RUNTIMES.set(access, runtime);
  return runtime;
}
export function resolveServerToshiCreditsRuntime(access: ServerPanelAccessRuntime): ServerToshiCreditsRuntime | null {
  try { return access?.readiness.mode === 'approved_staging' && access.panelOrigin ? RUNTIMES.get(access) ?? null : null; } catch { return null; }
}
