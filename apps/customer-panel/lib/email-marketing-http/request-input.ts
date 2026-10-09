import { emailMarketingUuid, emailMarketingText } from '@celebix/saas-contracts';
export const EMAIL_MARKETING_ROOT = '/api/marketing/email-connections';
export function emailMarketingRequestUrl(request: Request, path: string, query = false): URL { const url = new URL(request.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.pathname !== path || !query && url.search)
    throw TypeError('invalid'); for (const [header] of request.headers)
    if (header === 'authorization' || header.startsWith('x-celebix') || ['x-store-id', 'x-tenant-id', 'x-principal-id', 'x-membership-id', 'x-plan-id', 'x-database-url'].includes(header))
        throw TypeError('invalid'); return url; }
export function emailMarketingOperation(request: Request): string { return emailMarketingUuid(request.headers.get('idempotency-key')); }
export function emailMarketingQuery(request: Request, area: 'lists' | 'preview'): Readonly<{
    candidateId: string;
    cursor?: string;
    listId?: string;
}> { const p = new URL(request.url).searchParams, allowed = area === 'lists' ? ['candidateId', 'cursor'] : ['candidateId', 'listId']; if ([...p.keys()].some(k => !allowed.includes(k) || p.getAll(k).length !== 1))
    throw TypeError('invalid'); const candidateId = emailMarketingUuid(p.get('candidateId')); return { candidateId, ...(p.has('cursor') ? { cursor: emailMarketingText(p.get('cursor'), 2048) } : {}), ...(p.has('listId') ? { listId: emailMarketingText(p.get('listId'), 160) } : {}) }; }
export async function emailMarketingRequestBody(request: Request): Promise<unknown> { if (request.headers.get('content-type') !== 'application/json' || request.headers.has('transfer-encoding') || !request.body)
    throw TypeError('invalid'); const length = request.headers.get('content-length'); if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > 16384))
    throw TypeError('invalid'); const reader = request.body.getReader(), parts: Uint8Array[] = []; let total = 0; try {
    for (;;) {
        const p = await reader.read();
        if (p.done)
            break;
        total += p.value.byteLength;
        if (total > 16384) {
            await reader.cancel();
            throw TypeError('invalid');
        }
        parts.push(p.value);
    }
}
finally {
    reader.releaseLock();
} if (!total || length !== null && Number(length) !== total)
    throw TypeError('invalid'); const bytes = new Uint8Array(total); let offset = 0; for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
} return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
