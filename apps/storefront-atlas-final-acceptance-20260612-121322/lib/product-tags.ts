type ProductTagSuggestionRow = {
  id: string;
  value: string;
  usage_count: number;
};

const MAX_TAG_COUNT = 30;
const MAX_TAG_LENGTH = 40;
const MULTI_SPACE_REGEX = /\s+/g;

function collapseWhitespace(value: string): string {
  return value.replace(MULTI_SPACE_REGEX, " ").trim();
}

export function normalizeProductTag(value: string): string {
  return collapseWhitespace(value).toLocaleLowerCase("tr-TR");
}

export function normalizeProductTags(values: string[]): string[] {
  const normalized = values
    .map((value) => normalizeProductTag(String(value)))
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function validateAndNormalizeProductTags(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized = normalizeProductTags(
    values.filter((value): value is string => typeof value === "string")
  );

  if (normalized.length > MAX_TAG_COUNT) {
    throw new Error(`En fazla ${MAX_TAG_COUNT} etiket eklenebilir.`);
  }

  const tooLongTag = normalized.find((value) => value.length > MAX_TAG_LENGTH);
  if (tooLongTag) {
    throw new Error(`"${tooLongTag}" etiketi ${MAX_TAG_LENGTH} karakteri aşamaz.`);
  }

  return normalized;
}

export function diffProductTags(previous: string[], next: string[]) {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);

  const added = next.filter((value) => !previousSet.has(value));
  const removed = previous.filter((value) => !nextSet.has(value));

  return { added, removed };
}

type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{ data: ProductTagSuggestionRow[] | null; error: { message: string } | null }>;
    };
    upsert: (
      payload: {
        value: string;
        usage_count: number;
        last_used_at: string;
      }[],
      options: { onConflict: string }
    ) => Promise<{ error: { message: string } | null }>;
    update: (payload: {
      usage_count: number;
      last_used_at: string;
    }) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
    delete: () => {
      in: (column: string, values: string[]) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export async function syncProductTagSuggestions(
  supabase: SupabaseLikeClient,
  changes: {
    added?: string[];
    removed?: string[];
  }
) {
  const added = normalizeProductTags(changes.added || []);
  const removed = normalizeProductTags(changes.removed || []);

  if (added.length === 0 && removed.length === 0) {
    return;
  }

  const uniqueTags = Array.from(new Set([...added, ...removed]));
  const { data: existingRows, error: fetchError } = await supabase
    .from("product_tag_suggestions")
    .select("id,value,usage_count")
    .in("value", uniqueTags);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const existingMap = new Map(
    (existingRows || []).map((row) => [row.value, row])
  );

  const now = new Date().toISOString();
  const rowsToUpsert: {
    value: string;
    usage_count: number;
    last_used_at: string;
  }[] = [];
  const rowsToDelete: string[] = [];

  for (const value of uniqueTags) {
    const currentUsage = existingMap.get(value)?.usage_count || 0;
    const delta =
      (added.includes(value) ? 1 : 0) - (removed.includes(value) ? 1 : 0);
    const nextUsage = currentUsage + delta;

    if (nextUsage > 0) {
      rowsToUpsert.push({
        value,
        usage_count: nextUsage,
        last_used_at: now,
      });
      continue;
    }

    const existingRow = existingMap.get(value);
    if (existingRow) {
      rowsToDelete.push(existingRow.value);
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error } = await supabase
      .from("product_tag_suggestions")
      .upsert(rowsToUpsert, { onConflict: "value" });

    if (error) {
      throw new Error(error.message);
    }
  }

  if (rowsToDelete.length > 0) {
    const { error } = await supabase
      .from("product_tag_suggestions")
      .delete()
      .in("value", rowsToDelete);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export const PRODUCT_TAG_LIMITS = {
  maxCount: MAX_TAG_COUNT,
  maxLength: MAX_TAG_LENGTH,
};
