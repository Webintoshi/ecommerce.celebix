import type { MerchantAdminJson, MerchantAdminRecord } from "@celebix/saas-contracts";
import { merchantAdminApi } from "../merchant-admin-ui/client.ts";

export type CategorySeoDraft = Readonly<{ metaTitle: string; metaDescription: string }>;
export type CategorySeoState = Readonly<{ record?: MerchantAdminRecord; draft: CategorySeoDraft }>;
export const EMPTY_CATEGORY_SEO: CategorySeoDraft = Object.freeze({ metaTitle: "", metaDescription: "" });

export function categorySeoState(records: readonly MerchantAdminRecord[], categoryId: string): CategorySeoState {
  const matching = records.filter(record => record.kind === "seo_category_entry" && record.status !== "archived" && record.config.resourceId === categoryId);
  const active = matching.filter(record => record.status === "active");
  if (active.length > 1 || (active.length === 0 && matching.length > 1)) throw new Error("Kategori için birden fazla SEO kaydı var. Kategori SEO bölümünden düzenleyin.");
  const record = active[0] ?? matching[0];
  const title = record?.config.metaTitle, description = record?.config.metaDescription;
  return Object.freeze({ ...(record ? { record } : {}), draft: Object.freeze({ metaTitle: typeof title === "string" ? title : "", metaDescription: typeof description === "string" ? description : "" }) });
}

export function categorySeoConfig(record: MerchantAdminRecord | undefined, categoryId: string, draft: CategorySeoDraft): Readonly<Record<string, MerchantAdminJson>> {
  const title = draft.metaTitle.trim(), description = draft.metaDescription.trim();
  if (title.length > 160 || description.length > 4000 || /[\u0000-\u001f\u007f]/.test(title) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description)) throw new Error("SEO alanlarını kontrol edin.");
  const config: Record<string, MerchantAdminJson> = { ...(record?.config ?? {}), resourceId: categoryId };
  if (title) config.metaTitle = title; else delete config.metaTitle;
  if (description) config.metaDescription = description; else delete config.metaDescription;
  return Object.freeze(config);
}

export function createCategorySeoClient(api: Pick<typeof merchantAdminApi, "records" | "save" | "record"> = merchantAdminApi) {
  const pending = new Map<string, string>();
  return Object.freeze({
    async load(categoryId: string): Promise<CategorySeoState> { return categorySeoState(await api.records("seo_category_entry"), categoryId); },
    async save(categoryId: string, categoryName: string, state: CategorySeoState, draft: CategorySeoDraft): Promise<CategorySeoState> {
      const record = state.record;
      const value = {
        ...(record ? { recordId: record.id, expectedVersion: record.version } : {}),
        name: record?.name ?? categoryName,
        config: categorySeoConfig(record, categoryId, draft),
        status: record?.status === "draft" ? "draft" as const : "active" as const,
      };
      const key = JSON.stringify([categoryId, value]);
      const operationId = pending.get(key) ?? crypto.randomUUID();
      pending.set(key, operationId);
      const result = await api.save("seo_category_entry", value, operationId);
      const saved = await api.record("seo_category_entry", result.id);
      if (saved.config.resourceId !== categoryId || saved.version !== result.version) throw new Error("SEO kaydı doğrulanamadı. Kategori SEO bölümünü kontrol edin.");
      pending.delete(key);
      return categorySeoState([saved], categoryId);
    },
  });
}
export const categorySeoClient = createCategorySeoClient();
