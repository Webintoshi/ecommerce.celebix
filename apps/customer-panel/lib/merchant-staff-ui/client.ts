import { MerchantStaffError, parseStaffState, staffId, staffName, staffPhone, staffRole, staffVersion, type MerchantStaffState, type StaffCreateInput, type StaffUpdateInput, type StaffRevokeInput, type StaffDeleteInput } from './model.ts';
export { MerchantStaffError } from './model.ts';
export type MerchantStaffClient = Readonly<{
    state(): Promise<MerchantStaffState>;
    create(input: StaffCreateInput): Promise<MerchantStaffState>;
    update(id: string, input: StaffUpdateInput): Promise<MerchantStaffState>;
    revoke(id: string, input: StaffRevokeInput): Promise<MerchantStaffState>;
    delete(id: string, input: StaffDeleteInput): Promise<MerchantStaffState>;
}>;
export function createMerchantStaffClient(options: Readonly<{
    fetch?: typeof fetch;
}> = {}): MerchantStaffClient {
    const transport = options.fetch ?? fetch;
    let csrfToken: string | undefined;
    async function request(path: string, body?: Record<string, unknown>): Promise<MerchantStaffState> {
        const headers: Record<string, string> = { accept: 'application/json' };
        if (body) {
            if (!csrfToken)
                throw new MerchantStaffError('csrf_invalid');
            headers['content-type'] = 'application/json';
            headers['idempotency-key'] = staffId(body.operationId);
            headers['x-celebix-merchant-staff-csrf'] = csrfToken;
        }
        let response: Response;
        try {
            response = await transport(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
        }
        catch {
            throw new MerchantStaffError('operation_uncertain');
        }
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.code !== 'ok')
            throw new MerchantStaffError(typeof result?.code === 'string' ? result.code : 'unavailable');
        if (body) {
            if (Object.keys(result).sort().join(',') !== 'code,state')
                throw new MerchantStaffError('unavailable');
        }
        else {
            if (Object.keys(result).sort().join(',') !== 'code,csrfToken,state' || typeof result.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.csrfToken))
                throw new MerchantStaffError('unavailable');
            csrfToken = result.csrfToken;
        }
        return parseStaffState(result.state);
    }
    function base(input: StaffRevokeInput) { return { operationId: staffId(input.operationId), expectedVersion: staffVersion(input.expectedVersion) }; }
    return Object.freeze({ state: () => request('/api/merchant-staff'), create: input => request('/api/merchant-staff', { phone: staffPhone(input.phone), displayName: staffName(input.displayName), role: staffRole(input.role), ...base(input), ...(input.existingMembershipId ? { existingMembershipId: staffId(input.existingMembershipId) } : {}) }), update: (id, input) => { const changes = { ...(input.displayName !== undefined ? { displayName: staffName(input.displayName) } : {}), ...(input.role !== undefined ? { role: staffRole(input.role) } : {}) }; if (!Object.keys(changes).length)
            return Promise.reject(new MerchantStaffError('invalid_input')); return request(`/api/merchant-staff/${staffId(id)}`, { action: 'update', ...base(input), ...changes }); }, revoke: (id, input) => request(`/api/merchant-staff/${staffId(id)}`, { action: 'revoke', ...base(input) }), delete: (id, input) => request(`/api/merchant-staff/${staffId(id)}`, { action: 'delete', ...base(input) }) });
}
