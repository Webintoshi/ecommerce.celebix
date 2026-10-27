import 'server-only';
import type { ToshiCreditRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
import { createToshiImageAltService, type ToshiImageAltService } from './service.ts';
export type ServerToshiImageAltRuntime = Readonly<{ access: ServerPanelAccessRuntime & Readonly<{ panelOrigin: string }>; service: ToshiImageAltService }>;
const RUNTIMES = new WeakMap<ServerPanelAccessRuntime, ServerToshiImageAltRuntime>();
export function registerServerToshiImageAltRuntime(access: ServerPanelAccessRuntime, options: Readonly<{ credits: ToshiCreditRepository }>): ServerToshiImageAltRuntime {
  if (!access || access.readiness.mode !== 'approved_staging' || !access.panelOrigin || RUNTIMES.has(access) || !options || Object.keys(options).join(',') !== 'credits') throw Error('server_toshi_image_alt_runtime_invalid');
  const runtime = Object.freeze({ access: access as ServerToshiImageAltRuntime['access'], service: createToshiImageAltService({ credits: options.credits }) });
  RUNTIMES.set(access, runtime); return runtime;
}
export function resolveServerToshiImageAltRuntime(access: ServerPanelAccessRuntime): ServerToshiImageAltRuntime | null { try { return access?.readiness.mode === 'approved_staging' && access.panelOrigin ? RUNTIMES.get(access) ?? null : null; } catch { return null; } }
