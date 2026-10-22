import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../server-panel-access/default.ts';
import { resolveServerOrderEditRuntime } from '../server-order-edit/runtime.ts';
import { createOrderEditHttpHandlers } from './handler.ts';
const handlers = createOrderEditHttpHandlers({ resolveRuntime: async () => resolveServerOrderEditRuntime(await resolveDefaultServerPanelAccessRuntime()), now: () => new Date(), requestId: randomUUID });
type Context = Readonly<{
    params: Promise<Readonly<{
        orderId: string;
    }>>;
}>;
export async function getOrderEdit(request: Request, c: Context) { return handlers.get(request, (await c.params).orderId); }
export async function getOrderEditProducts(request: Request, c: Context) { return handlers.products(request, (await c.params).orderId); }
export async function previewOrderEdit(request: Request, c: Context) { return handlers.preview(request, (await c.params).orderId); }
export async function applyOrderEdit(request: Request, c: Context) { return handlers.apply(request, (await c.params).orderId); }
