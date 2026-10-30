import type { PolicyAuthoringRequest } from '../policy-authoring/types.ts';
import { parsePolicyAuthoringRequest, parsePolicyAuthoringResult } from '../policy-authoring/validation.ts';

export class PolicyAuthoringApiError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'PolicyAuthoringApiError'; }
}

export function createPolicyAuthoringClient(fetcher: typeof fetch = fetch) {
  return Object.freeze({
    async generate(request: PolicyAuthoringRequest, operationId: string) {
      const parsed = parsePolicyAuthoringRequest(request);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) throw new PolicyAuthoringApiError('invalid_input');
      const response = await fetcher('/api/content-ai/policies', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json', 'idempotency-key': operationId }, body: JSON.stringify(parsed) });
      if (response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json' || !response.body) throw new PolicyAuthoringApiError('unavailable');
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          total += next.value.byteLength;
          if (total > 524_288) { await reader.cancel(); throw new PolicyAuthoringApiError('invalid_response'); }
          chunks.push(next.value);
        }
        const joined = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
        const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
        if (!response.ok) {
          const code = (body as { code?: unknown })?.code;
          throw new PolicyAuthoringApiError(typeof code === 'string' && /^[a-z_]{1,60}$/.test(code) ? code : 'unavailable');
        }
        try { return parsePolicyAuthoringResult(body, { request: parsed, operationId }); }
        catch { throw new PolicyAuthoringApiError('invalid_response'); }
      } catch (error) {
        if (error instanceof PolicyAuthoringApiError) throw error;
        throw new PolicyAuthoringApiError('unavailable');
      } finally { reader.releaseLock(); }
    },
  });
}

export const policyAuthoringClient = createPolicyAuthoringClient();
