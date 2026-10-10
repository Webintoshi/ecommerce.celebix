"use client";
import { parseLuckyWheelPublicSettings, parseLuckyWheelSpinRequest, parseLuckyWheelSpinResult, type LuckyWheelPublicCampaign, type LuckyWheelSpinRequest, type LuckyWheelSpinResult } from "@celebix/saas-contracts";
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const FAILURES = ["invalid_input", "version_conflict", "operation_mismatch", "rate_limited", "campaign_unavailable", "quota_exhausted", "repeat_limited", "commit_uncertain"];
export class LuckyWheelClientError extends Error { constructor(readonly code: string) { super(code); this.name = "LuckyWheelClientError"; } }
export function createLuckyWheelClient(fetcher: Fetcher = fetch) {
  async function request(path: string, input?: LuckyWheelSpinRequest, signal?: AbortSignal): Promise<unknown> {
    try {
      const response = await fetcher(path, { method: input ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal, ...(input ? { headers: { "content-type": "application/json", "idempotency-key": input.operationId }, body: JSON.stringify(input) } : {}) });
      if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" || !response.body) throw new LuckyWheelClientError("invalid_response");
      const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true }); let length = 0, raw = "";
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength; if (length > 262144) { await reader.cancel(); throw new LuckyWheelClientError("invalid_response"); } raw += decoder.decode(chunk.value, { stream: true }); }
      const value = JSON.parse(raw + decoder.decode());
      if (!response.ok) throw new LuckyWheelClientError(value && typeof value === "object" && Object.keys(value).length === 1 && FAILURES.includes(value.code) ? value.code : "request_failed");
      return value;
    } catch (error) { if (error instanceof LuckyWheelClientError) throw error; throw new LuckyWheelClientError("request_failed"); }
  }
  const checked = <T,>(fn: () => T): T => { try { return fn(); } catch { throw new LuckyWheelClientError("invalid_response"); } };
  return Object.freeze({
    async settings(signal?: AbortSignal) { const value = await request("/api/lucky-wheel/settings", undefined, signal); return checked(() => parseLuckyWheelPublicSettings(value)); },
    async spin(raw: LuckyWheelSpinRequest) { let input; try { input = parseLuckyWheelSpinRequest(raw); } catch { throw new LuckyWheelClientError("invalid_input"); } const value = await request("/api/lucky-wheel/spin", input); const award = checked(() => parseLuckyWheelSpinResult(value)); if (award.operationId !== input.operationId || award.campaignId !== input.campaignId || award.campaignVersion !== input.expectedVersion) throw new LuckyWheelClientError("invalid_response"); return award; },
    async result(campaignId: string, operationId?: string) { const value = await request(`/api/lucky-wheel/result?campaignId=${encodeURIComponent(campaignId)}${operationId ? `&operationId=${encodeURIComponent(operationId)}` : ""}`); if (value === null) return null; const award = checked(() => parseLuckyWheelSpinResult(value)); if (award.campaignId !== campaignId || operationId && award.operationId !== operationId) throw new LuckyWheelClientError("invalid_response"); return award; },
  });
}
export type WheelClient = Pick<ReturnType<typeof createLuckyWheelClient>, "spin" | "result">;
type Contact = Readonly<{ email?: string; phone?: string; marketingConsent: boolean }>;
type OperationStore = Readonly<{ read(): string | null; write(value: string | null): void }>;
export function createWheelParticipation(client: WheelClient, store: OperationStore, uuid: () => string = () => crypto.randomUUID(), now = Date.now) {
  let command: LuckyWheelSpinRequest | null = null, award: LuckyWheelSpinResult | null = null, pending: Promise<LuckyWheelSpinResult> | null = null;
  return Object.freeze({
    async recover(campaign: LuckyWheelPublicCampaign) { const result = await client.result(campaign.id, store.read() ?? undefined); if (result) { award = result; store.write(result.operationId); } return result; },
    async spin(campaign: LuckyWheelPublicCampaign, contact: Contact): Promise<LuckyWheelSpinResult> {
      if (pending) return pending;
      if (award && now() < Date.parse(award.repeatEligibleAt)) return award;
      if (!command || award && now() >= Date.parse(award.repeatEligibleAt)) {
        const modeValid = campaign.collectMode === "either" || campaign.collectMode === "email" && contact.email !== undefined || campaign.collectMode === "phone" && contact.phone !== undefined;
        if (!modeValid) throw new LuckyWheelClientError("invalid_input");
        try { command = parseLuckyWheelSpinRequest({ ...contact, operationId: award ? uuid() : store.read() ?? uuid(), campaignId: campaign.id, expectedVersion: campaign.version }); } catch { throw new LuckyWheelClientError("invalid_input"); }
        store.write(command.operationId);
      }
      pending = client.spin(command).then(result => { award = result; return result; });
      try { return await pending; } catch (error) { if (error instanceof LuckyWheelClientError && ["invalid_input", "version_conflict", "campaign_unavailable", "quota_exhausted", "repeat_limited"].includes(error.code)) { command = null; store.write(null); } throw error; } finally { pending = null; }
    },
  });
}
export function wheelLandingAngle(prizes: readonly { id: string }[], prizeId: string): number {
  const index = prizes.findIndex(prize => prize.id === prizeId); if (index < 0 || prizes.length < 4 || prizes.length > 8) throw new LuckyWheelClientError("invalid_response");
  return 5 * 360 + 360 - (index + .5) * 360 / prizes.length;
}
