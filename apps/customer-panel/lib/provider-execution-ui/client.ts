import {
  MERCHANT_PROVIDER_CAPABILITIES,
  parseMerchantProviderDescriptor,
  parseMerchantProviderProfile,
  type MerchantAdminJson,
  type MerchantProviderCapability,
  type MerchantProviderDescriptor,
  type MerchantProviderProfile,
} from "@celebix/saas-contracts";

const CODES = [
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
  "feature_not_enabled", "provider_not_found", "provider_capability_mismatch",
  "provider_disabled", "profile_not_found", "invalid_transition", "version_conflict",
  "operation_mismatch", "operation_not_found", "durable_authority_invalid", "unavailable",
] as const;
type Code = (typeof CODES)[number];
const MESSAGES: Readonly<Record<Code, string>> = Object.freeze({
  invalid_input: "Gönderilen sağlayıcı bilgileri geçersiz.", unauthenticated: "Oturumunuz sona erdi.",
  membership_denied: "Bu işlem için yetkiniz yok.", store_inactive: "Mağaza işlemlere kapalı.",
  feature_not_enabled: "Entegrasyonlar planınızda etkin değil.", provider_not_found: "Sağlayıcı bulunamadı.",
  provider_capability_mismatch: "Sağlayıcı bu işlem türünü desteklemiyor.", provider_disabled: "Sağlayıcı bağlantısı etkin değil.",
  profile_not_found: "Sağlayıcı bağlantısı bulunamadı.", invalid_transition: "Bu işlem artık uygulanamaz.",
  version_conflict: "Bağlantı sizden önce güncellendi.", operation_mismatch: "İşlem güvenle tekrar edilemedi.",
  operation_not_found: "İşlem kanıtı bulunamadı.", durable_authority_invalid: "Yetki yeniden doğrulanamadı.",
  unavailable: "Sağlayıcı bağlantıları şu anda kullanılamıyor.",
});

export class ProviderExecutionApiError extends Error {
  constructor(readonly code: Code, readonly status: number) {
    super(MESSAGES[code]);
    this.name = "ProviderExecutionApiError";
  }
}

type Fetch = typeof fetch;
type SaveInput = Readonly<{
  providerCode: string;
  capability: MerchantProviderCapability;
  publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  credential: Readonly<Record<string, string>>;
  expectedVersion: number;
  profileId?: string;
}>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
    ? value as Record<string, unknown>
    : null;
}
function capability(value: MerchantProviderCapability): MerchantProviderCapability {
  if (!MERCHANT_PROVIDER_CAPABILITIES.includes(value)) throw new TypeError("provider_execution_client_invalid");
  return value;
}
function id(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new TypeError("provider_execution_client_invalid");
  return value;
}
async function responseJson(response: Response): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new ProviderExecutionApiError("unavailable", response.status || 503);
  try { return await response.json(); } catch { throw new ProviderExecutionApiError("unavailable", 503); }
}
function items<T>(value: unknown, parser: (entry: unknown) => T): readonly T[] {
  const selected = record(value);
  if (!selected || Object.keys(selected).join(",") !== "items" || !Array.isArray(selected.items) || selected.items.length > 100) throw new ProviderExecutionApiError("unavailable", 503);
  try { return Object.freeze(selected.items.map(parser)); } catch { throw new ProviderExecutionApiError("unavailable", 503); }
}

export function createProviderExecutionApi(fetcher: Fetch = fetch, uuid: () => string = crypto.randomUUID.bind(crypto)) {
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetcher(path, { credentials: "same-origin", cache: "no-store", ...init });
    const value = await responseJson(response);
    if (!response.ok) {
      const selected = record(value), code = selected && typeof selected.code === "string" && CODES.includes(selected.code as Code)
        ? selected.code as Code
        : "unavailable";
      throw new ProviderExecutionApiError(code, response.status);
    }
    return value;
  }
  function post(path: string, value: unknown): Promise<unknown> {
    return request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": id(uuid()) },
      body: JSON.stringify(value),
    });
  }
  function parseProfile(value: unknown): MerchantProviderProfile {
    try { return parseMerchantProviderProfile(value); } catch { throw new ProviderExecutionApiError("unavailable", 503); }
  }
  return Object.freeze({
    async definitions(selected: MerchantProviderCapability): Promise<readonly MerchantProviderDescriptor[]> {
      return items(await request(`/api/merchant-providers/definitions?capability=${capability(selected)}`), parseMerchantProviderDescriptor);
    },
    async profiles(selected: MerchantProviderCapability): Promise<readonly MerchantProviderProfile[]> {
      return items(await request(`/api/merchant-providers/profiles?capability=${capability(selected)}`), parseMerchantProviderProfile);
    },
    async save(input: SaveInput): Promise<MerchantProviderProfile> {
      capability(input.capability);
      if (input.profileId !== undefined) id(input.profileId);
      return parseProfile(await post("/api/merchant-providers/profiles", input));
    },
    async disable(profileId: string, expectedVersion: number): Promise<MerchantProviderProfile> {
      return parseProfile(await post(`/api/merchant-providers/profiles/${id(profileId)}/disable`, { expectedVersion }));
    },
    async revoke(profileId: string, expectedVersion: number): Promise<MerchantProviderProfile> {
      return parseProfile(await post(`/api/merchant-providers/profiles/${id(profileId)}/revoke`, { expectedVersion }));
    },
  });
}

export const providerExecutionApi = createProviderExecutionApi();
