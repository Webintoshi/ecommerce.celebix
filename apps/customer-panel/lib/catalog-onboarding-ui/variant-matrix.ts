export type VariantMatrixOption = Readonly<{ name: string; values: readonly string[] }>;

export type VariantMatrixResult =
  | Readonly<{ ok: true; value: readonly Readonly<{ title: string; attributes: Readonly<Record<string, string>> }>[] }>
  | Readonly<{ ok: false; error: string }>;

function invalid(error: string): VariantMatrixResult {
  return Object.freeze({ ok: false, error });
}

export function buildVariantMatrix(input: readonly VariantMatrixOption[]): VariantMatrixResult {
  if (!Array.isArray(input) || input.length < 1 || input.length > 3) return invalid("1–3 varyant niteliği ekleyin.");
  const names = new Set<string>();
  let count = 1;
  const options: Array<{ name: string; values: readonly string[] }> = [];
  for (const item of input) {
    if (!item || typeof item.name !== "string" || !Array.isArray(item.values)) return invalid("Varyant niteliği geçersiz.");
    const name = item.name.trim();
    if (name.length < 1 || name.length > 64 || names.has(name.toLocaleLowerCase("tr-TR"))) return invalid("Varyant nitelikleri benzersiz olmalıdır.");
    names.add(name.toLocaleLowerCase("tr-TR"));
    const values = item.values.map((value: unknown) => typeof value === "string" ? value.trim() : "");
    const normalized = values.map((value: string) => value.toLocaleLowerCase("tr-TR"));
    if (values.length < 1 || values.length > 20 || values.some((value: string) => value.length < 1 || value.length > 100) || new Set(normalized).size !== values.length) return invalid("Varyant değerleri boş veya tekrar eden olamaz.");
    count *= values.length;
    if (count > 100) return invalid("En fazla 100 varyant oluşturabilirsiniz.");
    options.push({ name, values });
  }
  let combinations: Array<Record<string, string>> = [{}];
  for (const option of options) combinations = combinations.flatMap((current) => option.values.map((value) => ({ ...current, [option.name]: value })));
  return Object.freeze({
    ok: true,
    value: Object.freeze(combinations.map((attributes) => Object.freeze({
      title: Object.values(attributes).join(" / "),
      attributes: Object.freeze(attributes),
    }))),
  });
}
