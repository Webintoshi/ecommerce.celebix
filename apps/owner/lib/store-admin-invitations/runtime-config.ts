import { X509Certificate } from "node:crypto";
import { createOwnerStagingDatabasePoolConfig, type OwnerStagingAuthConfig } from "../self-serve-auth-authority/config.ts";
import { parseInvitationDeliveryConfig, type InvitationDeliveryConfig } from "./delivery-config.ts";
import type { InvitationPayloadKeyring } from "./seal.ts";

type Environment = Readonly<Record<string, string | undefined>>;
export interface InvitationRuntimeConfig {
  readonly delivery: InvitationDeliveryConfig;
  readonly keyring: InvitationPayloadKeyring;
  readonly workerId: string;
  readonly database: OwnerStagingAuthConfig["database"];
  readonly poolConfig: ReturnType<typeof createOwnerStagingDatabasePoolConfig>;
}
function invalid(): never { throw new Error("store_admin_invitation_runtime_config_invalid"); }
function required(env: Environment, name: string, maximum = 8192): string {
  const value = env[name];
  if (typeof value !== "string" || !value || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) invalid();
  return value;
}
/** Pure parsing only. Reuse Owner's validated existing LOGIN and CA; startup must
 * preflight current_database and the two fixed SET LOCAL role capabilities. */
export function parseInvitationRuntimeConfig(env: Environment, ownerDatabase?: OwnerStagingAuthConfig["database"], authority?: Pick<OwnerStagingAuthConfig["authority"], "panelOrigin">): Readonly<InvitationRuntimeConfig> | null {
  const decoded: Buffer[] = [];
  try {
    if (env.CELEBIX_ADMIN_INVITATIONS_ENABLED === undefined || env.CELEBIX_ADMIN_INVITATIONS_ENABLED === "false") return null;
    if (env.CELEBIX_ADMIN_INVITATIONS_MODE !== "approved_staging" || env.CELEBIX_DEPLOYMENT_TIER !== "staging") invalid();
    const delivery = parseInvitationDeliveryConfig(env);
    if (!delivery || !ownerDatabase || !authority || delivery.acceptanceOrigin !== authority.panelOrigin) invalid();
    const database = Object.freeze({ ...ownerDatabase });
    if (!/^celebix_saas_staging_[a-z0-9][a-z0-9_]{1,47}$/u.test(database.name)) invalid();
    const url = new URL(database.url);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.password || !url.hostname || url.pathname !== `/${database.name}` || url.hash || url.searchParams.size !== 1 || url.searchParams.get("sslmode") !== "verify-full") invalid();
    new X509Certificate(database.ca);
    const workerId = required(env, "CELEBIX_ADMIN_INVITATIONS_WORKER_ID", 80);
    if (!/^[A-Za-z0-9_-]{1,80}$/u.test(workerId)) invalid();
    const activeKeyId = required(env, "CELEBIX_ADMIN_INVITATIONS_PAYLOAD_ACTIVE_KEY_ID", 32);
    const raw: unknown = JSON.parse(required(env, "CELEBIX_ADMIN_INVITATIONS_PAYLOAD_KEYRING"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) invalid();
    const entries = Object.entries(raw);
    if (!entries.length || entries.length > 16) invalid();
    const keys: Record<string, Buffer> = Object.create(null);
    for (const [id, encoded] of entries) {
      if (!/^[a-z][a-z0-9_-]{2,31}$/u.test(id) || typeof encoded !== "string" || !/^[A-Za-z0-9+/]{43}=$/u.test(encoded)) invalid();
      const bytes = Buffer.from(encoded, "base64"); decoded.push(bytes);
      if (bytes.length !== 32 || bytes.toString("base64") !== encoded || decoded.slice(0, -1).some(prior => prior.equals(bytes))) invalid();
      keys[id] = bytes;
    }
    if (!Object.hasOwn(keys, activeKeyId)) invalid();
    return Object.freeze({ delivery, keyring: Object.freeze({ activeKeyId, keys: Object.freeze(keys) }), workerId, database, poolConfig: createOwnerStagingDatabasePoolConfig(database) });
  } catch { for (const bytes of decoded) bytes.fill(0); return invalid(); }
}
