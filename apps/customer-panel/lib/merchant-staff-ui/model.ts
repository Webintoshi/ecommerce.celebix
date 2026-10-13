import { normalizeStorefrontAccountPhone } from '../../../storefront-shared/lib/account/phone.ts';
export const STAFF_ROLES = Object.freeze(['admin', 'editor', 'analyst', 'cashier'] as const);
export type StaffRole = typeof STAFF_ROLES[number];
export const STAFF_ROLE_LABELS: Readonly<Record<StaffRole, string>> = Object.freeze({ admin: 'Yönetici', editor: 'Editör', analyst: 'Analist', cashier: 'Kasiyer' });
export type MerchantStaff = Readonly<{
    staffId: string;
    displayName: string;
    phoneMasked: string | null;
    role: StaffRole;
    enabled: boolean;
    version: number;
    phoneVerified: boolean;
    membershipId?: string;
}>;
export type MerchantStaffState = Readonly<{
    version: number;
    staff: readonly MerchantStaff[];
    enabled: boolean;
}>;
export type StaffCreateInput = Readonly<{
    phone: string;
    displayName: string;
    role: StaffRole;
    operationId: string;
    expectedVersion: number;
    existingMembershipId?: string;
}>;
export type StaffUpdateInput = Readonly<{
    operationId: string;
    expectedVersion: number;
    displayName?: string;
    role?: StaffRole;
}>;
export type StaffRevokeInput = Readonly<{
    operationId: string;
    expectedVersion: number;
}>;
export function staffErrorMessage(code: string): string { const messages: Record<string, string> = { invalid_phone: 'Geçerli bir kişisel telefon numarası girin.', invalid_input: 'Adı, telefon numarasını ve rolü kontrol edin.', version_conflict: 'Kayıt değişti. Güncel listeyi yükleyip bilgileri kontrol edin.', phone_conflict: 'Bu telefon numarası bu personel kaydıyla eşleştirilemedi.', phone_identity_conflict: 'Bu telefon numarası bu personel kaydıyla eşleştirilemedi.', staff_limit_reached: 'Paketinizdeki personel sınırına ulaşıldı.', feature_not_enabled: 'Personel yönetimi bu mağazada henüz etkin değil.', unauthorized: 'Personel yönetimini yalnızca mağaza sahibi yapabilir.', operation_uncertain: 'İşlem sonucu doğrulanamadı. Bilgileriniz korunuyor; aynı işlemle yeniden deneyin.', csrf_invalid: 'Güvenlik doğrulaması tamamlanamadı. Güncel listeyi yeniden yükleyin.' }; return messages[code] ?? 'Personel bilgileri alınamadı. Bilgileriniz korunuyor; yeniden deneyebilirsiniz.'; }
export class MerchantStaffError extends Error {
    constructor(readonly code: string) { super(staffErrorMessage(code)); }
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function staffId(value: unknown): string { if (typeof value !== 'string' || !UUID.test(value))
    throw new MerchantStaffError('invalid_input'); return value; }
export function staffPhone(value: string): string { try {
    return normalizeStorefrontAccountPhone(value);
}
catch {
    throw new MerchantStaffError('invalid_phone');
} }
export function staffName(value: string): string { const name = value.trim(); if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name))
    throw new MerchantStaffError('invalid_input'); return name; }
export function staffVersion(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) >= Number.MAX_SAFE_INTEGER)
    throw new MerchantStaffError('invalid_input'); return Number(value); }
export function staffRole(value: unknown): StaffRole { if (!STAFF_ROLES.includes(value as StaffRole))
    throw new MerchantStaffError('invalid_input'); return value as StaffRole; }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MerchantStaffError('unavailable'); const row = value as Record<string, unknown>; if (required.some(k => !Object.hasOwn(row, k)) || Object.keys(row).some(k => !required.includes(k) && !optional.includes(k)))
    throw new MerchantStaffError('unavailable'); return row; }
export function parseStaffState(value: unknown): MerchantStaffState {
    const row = record(value, ['version', 'staff', 'enabled']);
    staffVersion(row.version);
    if (typeof row.enabled !== 'boolean' || !Array.isArray(row.staff) || row.staff.length > 1000)
        throw new MerchantStaffError('unavailable');
    const ids = new Set<string>();
    const staff = row.staff.map(value => { const item = record(value, ['staffId', 'displayName', 'phoneMasked', 'role', 'enabled', 'version', 'phoneVerified'], ['membershipId']); staffId(item.staffId); if (ids.has(String(item.staffId)))
        throw new MerchantStaffError('unavailable'); ids.add(String(item.staffId)); if (typeof item.displayName !== 'string' || staffName(item.displayName) !== item.displayName || (item.phoneMasked !== null && (typeof item.phoneMasked !== 'string' || item.phoneMasked.length > 80)) || typeof item.enabled !== 'boolean' || typeof item.phoneVerified !== 'boolean')
        throw new MerchantStaffError('unavailable'); staffRole(item.role); staffVersion(item.version); if (item.membershipId !== undefined)
        staffId(item.membershipId); return Object.freeze(item as MerchantStaff); });
    return Object.freeze({ version: Number(row.version), enabled: row.enabled, staff: Object.freeze(staff) });
}
