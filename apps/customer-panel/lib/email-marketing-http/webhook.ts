import { createHash } from 'node:crypto';
import { emailMarketingUuid } from '@celebix/saas-contracts';
import type { EmailMarketingWebhookRepository, EmailMarketingWebhookEvent } from '@celebix/saas-data';
function response(status: number) { return new Response(null, { status, headers: { 'cache-control': 'no-store' } }); }
function events(payload: unknown, connectionId: string): readonly EmailMarketingWebhookEvent[] {
    const rows = Array.isArray(payload) ? payload : [payload];
    if (rows.length > 100)
        throw Error('invalid');
    const output: EmailMarketingWebhookEvent[] = [];
    for (const value of rows) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw Error('invalid');
        const p = value as Record<string, unknown>;
        if (typeof p.email !== 'string' || p.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
            throw Error('invalid');
        const address = p.email.toLowerCase(), event = p.event;
        const kind = event === 'unsubscribe' || event === 'unsubscribed' ? 'unsubscribe' : event === 'spam' || event === 'hardBounce' || event === 'contactUpdated' && p.emailBlacklisted === true ? 'suppressed' : null;
        if (!kind)
            continue;
        const eventTime = typeof p.ts_event === 'number' && Number.isSafeInteger(p.ts_event) && p.ts_event > 0 && p.ts_event <= Date.now() / 1000 + 300 ? new Date(p.ts_event * 1000).toISOString() : null;
        let lists: string[] = [];
        if (p.list_id !== undefined) {
            if (!Array.isArray(p.list_id) || p.list_id.length > 100)
                throw Error('invalid');
            lists = p.list_id.map(id => { if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
                throw Error('invalid'); return String(id); });
        }
        if (kind === 'unsubscribe' && !lists.length)
            continue;
        const targets = kind === 'suppressed' ? [null] : lists;
        for (const listId of targets) {
            const identity = JSON.stringify([connectionId, address, event, eventTime, typeof p.camp_id === 'number' ? p.camp_id : null, listId]);
            output.push(Object.freeze({ eventId: createHash('sha256').update(identity).digest('hex'), email: address, kind, scope: listId ? 'list' : 'account', listId, eventTime }));
            if (output.length > 100)
                throw Error('invalid');
        }
    }
    return Object.freeze(output);
}
export function createBrevoEmailMarketingWebhookHandler(repository: EmailMarketingWebhookRepository) {
    return async (request: Request, connectionId: string): Promise<Response> => {
        let u: URL;
        try {
            u = new URL(request.url);
            emailMarketingUuid(connectionId);
        }
        catch {
            return response(400);
        }
        const auth = request.headers.get('authorization');
        if (u.protocol !== 'https:' || u.hostname !== 'panel.saas-staging.celebix.net' || u.port || !auth || !/^Bearer [A-Za-z0-9_-]{43}$/.test(auth))
            return response(401);
        if (request.method !== 'POST' || request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
            return response(400);
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        const reader = request.body?.getReader();
        if (!reader)
            return response(400);
        try {
            for (;;) {
                const part = await reader.read();
                if (part.done)
                    break;
                bytes += part.value.length;
                if (bytes > 65536) {
                    await reader.cancel();
                    return response(413);
                }
                chunks.push(part.value);
            }
            const joined = new Uint8Array(bytes);
            let position = 0;
            for (const chunk of chunks) {
                joined.set(chunk, position);
                position += chunk.length;
            }
            let parsed: readonly EmailMarketingWebhookEvent[];
            try {
                parsed = events(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)), connectionId);
            }
            catch {
                return response(400);
            }
            const result = await repository.receive({ hostname: u.hostname, connectionId, tokenDigest: createHash('sha256').update(auth.slice(7)).digest('hex'), events: parsed });
            return response(result.authenticated ? 200 : 401);
        }
        catch {
            return response(503);
        }
        finally {
            reader.releaseLock();
        }
    };
}
