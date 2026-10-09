import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../server-panel-access/default.ts';
import { resolveServerEmailMarketingRuntime, resolveServerEmailMarketingWebhookRepository } from '../server-email-marketing/runtime.ts';
import { createEmailMarketingHttpHandlers } from './handler.ts';
import { createBrevoEmailMarketingWebhookHandler } from './webhook.ts';
export const emailMarketingHandlers = createEmailMarketingHttpHandlers({ resolveRuntime: async () => resolveServerEmailMarketingRuntime(await resolveDefaultServerPanelAccessRuntime()), now: () => new Date(), requestId: randomUUID });
export async function emailMarketingBrevoWebhook(request: Request, connectionId: string): Promise<Response> { try {
    const repository = resolveServerEmailMarketingWebhookRepository(await resolveDefaultServerPanelAccessRuntime());
    return repository ? createBrevoEmailMarketingWebhookHandler(repository)(request, connectionId) : new Response(null, { status: 503 });
}
catch {
    return new Response(null, { status: 503 });
} }
