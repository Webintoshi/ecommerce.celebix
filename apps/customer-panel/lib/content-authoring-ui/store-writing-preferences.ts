import type { ContentAuthoringRequest, MerchantAdminRecord } from "@celebix/saas-contracts";
import { merchantAdminApi } from "../merchant-admin-ui/client.ts";

export type StoreWritingDefaults = Readonly<{ locale: string | null; tone: ContentAuthoringRequest["tone"] | null; brandVoice: string | null }>;
export type StoreWritingPreferencesApi = Pick<typeof merchantAdminApi, "records">;
const aliases: Readonly<Record<string, ContentAuthoringRequest["tone"]>> = {
  neutral: "neutral", "doğal": "neutral", dogal: "neutral", "nötr": "neutral", notr: "neutral",
  friendly: "friendly", samimi: "friendly", professional: "professional", profesyonel: "professional",
};
const invalid = () => { throw new Error("store_writing_preferences_invalid"); };
export function parseStoreWritingDefaults(records: readonly MerchantAdminRecord[]): StoreWritingDefaults {
  if (!Array.isArray(records) || records.length > 1) return invalid();
  if (!records.length) return { locale: null, tone: null, brandVoice: null };
  const row = records[0];
  if (row.kind !== "ai_setting" || row.status !== "active") return invalid();
  const config = row.config;
  if (!config || Object.keys(config).some(key => !["locale", "tone", "enabledFeatures"].includes(key))) return invalid();
  const features = config.enabledFeatures;
  if (!Array.isArray(features) || !features.length || features.length > 3 || new Set(features).size !== features.length || features.some(value => !["description_suggestions", "seo_suggestions", "campaign_drafts"].includes(String(value)))) return invalid();
  let locale: string | null = null, tone: ContentAuthoringRequest["tone"] | null = null, brandVoice: string | null = null;
  if (Object.hasOwn(config, "locale")) {
    const value = config.locale;
    if (typeof value !== "string" || value.length > 35 || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(value)) return invalid();
    locale = value;
  }
  if (Object.hasOwn(config, "tone")) {
    const value = config.tone;
    if (typeof value !== "string" || !value.length || value.length > 160 || value.trim() !== value || /[<>\u0000-\u001f\u007f-\u009f]/.test(value) || /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/.test(value)) return invalid();
    const candidates = [value.toLocaleLowerCase("tr-TR"), value.toLowerCase()];
    const alias = candidates.find(candidate => Object.hasOwn(aliases, candidate));
    tone = alias === undefined ? "neutral" : aliases[alias];
    if (alias === undefined) brandVoice = value;
  }
  return { locale, tone, brandVoice };
}

// Mounted description/SEO panels share only this safe read. Release the entry
// when no panel uses it so a later opening reads current store settings.
const reads = new Map<string, { api: StoreWritingPreferencesApi; users: number; promise: Promise<StoreWritingDefaults> }>();
export function acquireStoreWritingDefaults(storeKey: string, api: StoreWritingPreferencesApi = merchantAdminApi, refresh = false) {
  let entry = reads.get(storeKey);
  if (refresh || !entry || entry.api !== api) {
    entry = { api, users: 0, promise: Promise.resolve().then(() => api.records("ai_setting")).then(parseStoreWritingDefaults) };
    reads.set(storeKey, entry);
  }
  entry.users++;
  const owned = entry;
  return { promise: owned.promise, release() { owned.users--; if (!owned.users && reads.get(storeKey) === owned) reads.delete(storeKey); } };
}
