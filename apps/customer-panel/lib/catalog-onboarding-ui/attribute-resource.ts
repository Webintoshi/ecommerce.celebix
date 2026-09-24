import type { CatalogAdminResource, CatalogAdminJson } from "@celebix/saas-contracts";

type AttributeResourceMutation = Readonly<{
  resourceId?: string;
  expectedVersion?: number;
  name: string;
  slug: string;
  config: Readonly<Record<string, CatalogAdminJson>>;
  productIds: readonly string[];
}>;

export function attributeSlug(name: string): string {
  return name.toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
    .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 120).replace(/-$/g, "");
}

export function buildAttributeResourceMutation(input: Readonly<{
  name?: string;
  existing?: CatalogAdminResource;
  values: readonly string[];
}>): Readonly<{ ok: true; value: AttributeResourceMutation }> | Readonly<{ ok: false; error: string }> {
  const existing = input.existing;
  const name = (existing?.name ?? input.name ?? "").trim();
  const slug = existing?.slug ?? attributeSlug(name);
  const original = existing?.config.values;
  const previous = existing === undefined ? [] : Array.isArray(original) && original.every((value) => typeof value === "string") ? original as string[] : null;
  if (!name || name.length > 120 || !slug || previous === null || existing?.status === "archived") return { ok: false, error: "Geçerli bir nitelik adı girin." };
  const additions = input.values.map((value) => value.trim());
  const values = [...previous, ...additions];
  if (!additions.length || values.length > 64 || values.some((value) => !value || value.length > 100) ||
    new Set(values.map((value) => value.toLocaleLowerCase("tr-TR"))).size !== values.length) {
    return { ok: false, error: "En az bir benzersiz değer ekleyin (en fazla 64 değer, değer başına 100 karakter)." };
  }
  return { ok: true, value: {
    ...(existing === undefined ? {} : { resourceId: existing.id, expectedVersion: existing.version }),
    name,
    slug,
    config: { ...(existing?.config ?? {}), values },
    productIds: existing?.productIds ?? [],
  } };
}

export async function saveAttributeForPicker(api: Readonly<{
  saveResource(kind: "attribute", value: AttributeResourceMutation): Promise<Readonly<{ id: string }>>;
  resource(kind: "attribute", id: string): Promise<CatalogAdminResource>;
}>, input: Readonly<{ name?: string; existing?: CatalogAdminResource; values: readonly string[] }>): Promise<CatalogAdminResource> {
  const parsed = buildAttributeResourceMutation(input);
  if (!parsed.ok) throw new TypeError(parsed.error);
  const mutation = await api.saveResource("attribute", parsed.value);
  const saved = await api.resource("attribute", mutation.id);
  if (saved.id !== mutation.id || saved.kind !== "attribute" || saved.status !== "active") throw new Error("saved_attribute_unavailable");
  return saved;
}
