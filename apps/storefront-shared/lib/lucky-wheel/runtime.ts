import { parseLuckyWheelPublicSettings, parseLuckyWheelSpinRequest, parseLuckyWheelSpinResult, type LuckyWheelPublicSettings, type LuckyWheelSpinRequest, type LuckyWheelSpinResult } from "@celebix/saas-contracts";
import { createWheelCredential, digestWheelCredential, readWheelCredential, readWheelOperationCookie, serializeWheelCredential } from "./credential.ts";

type Scope = { hostname: string; visitorDigest: string; now: Date };
type Repository = Readonly<{ publicSettings(input: { hostname: string; now: Date }): Promise<LuckyWheelPublicSettings>; spin(input: Scope & LuckyWheelSpinRequest): Promise<LuckyWheelSpinResult>; result(input: Scope & { campaignId: string; operationId?: string }): Promise<LuckyWheelSpinResult | null> }>;
export class LuckyWheelRuntimeError extends Error { constructor(readonly code: "invalid_input" | "unavailable" = "invalid_input") { super(`wheel_${code}`); } }
function output<T>(read: () => T): T { try { return read(); } catch { throw new LuckyWheelRuntimeError("unavailable"); } }
export function createLuckyWheelRuntime(deps: Readonly<{ repository: Repository; randomBytes(size: number): Uint8Array; now(): Date }>) {
  const scope = (hostname: string, cookie: string | null): Scope => { const credential = readWheelCredential(cookie); if (credential.kind !== "present") throw new LuckyWheelRuntimeError(); return { hostname, visitorDigest: digestWheelCredential(hostname, credential.value), now: deps.now() }; };
  const result = async (hostname: string, cookie: string | null, input: { campaignId: string; operationId?: string }) => { const value = await deps.repository.result({ ...scope(hostname, cookie), ...input }); return value === null ? null : output(() => parseLuckyWheelSpinResult(value)); };
  return Object.freeze({
    async publicSettings(hostname: string, cookie: string | null) {
      const credential = readWheelCredential(cookie); if (credential.kind === "invalid") throw new LuckyWheelRuntimeError();
      const value = await deps.repository.publicSettings({ hostname, now: deps.now() });
      const settings = output(() => parseLuckyWheelPublicSettings(value));
      const created = settings.campaign && credential.kind === "missing" ? createWheelCredential(hostname, deps.randomBytes) : null;
      return { settings, setCookie: created ? serializeWheelCredential(created.value) : null };
    },
    async spin(hostname: string, cookie: string | null, raw: unknown) { const input = parseLuckyWheelSpinRequest(raw); const value = await deps.repository.spin({ ...scope(hostname, cookie), ...input }); return output(() => parseLuckyWheelSpinResult(value)); },
    result,
    async recoverResult(hostname: string, cookie: string | null): Promise<LuckyWheelSpinResult | null> {
      const operation = readWheelOperationCookie(cookie); if (!operation || readWheelCredential(cookie).kind !== "present") return null;
      return result(hostname, cookie, operation);
    },
    async pendingCoupon(hostname: string, cookie: string | null): Promise<string | null> {
      const operation = readWheelOperationCookie(cookie); if (!operation || readWheelCredential(cookie).kind !== "present") return null;
      const award = await result(hostname, cookie, operation);
      return award && ["active", "held"].includes(award.couponStatus) && Date.parse(award.expiresAt) > deps.now().getTime() ? award.couponCode : null;
    },
  });
}
export type LuckyWheelRuntime = ReturnType<typeof createLuckyWheelRuntime>;
