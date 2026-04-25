type QueryResult<T> = {
  data: T;
  error: unknown;
};

function getMissingTableColumn(error: unknown, tableName: string): string | null {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return null;
  }

  const message = String(error.message ?? "");

  const schemaCacheMatch = message.match(
    new RegExp(`Could not find the '([^']+)' column of '${tableName}'`, "i"),
  );
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  const qualifiedMatch = message.match(
    new RegExp(`column\\s+${tableName}\\.([a-zA-Z0-9_]+)\\s+does not exist`, "i"),
  );
  if (qualifiedMatch?.[1]) {
    return qualifiedMatch[1];
  }

  const relationMatch = message.match(
    new RegExp(`column [\"']([^\"']+)[\"'] of relation [\"']${tableName}[\"'] does not exist`, "i"),
  );
  return relationMatch?.[1] ?? null;
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = String(error.code ?? "").trim();
  return code.length > 0 ? code : null;
}

function containsIsActiveReference(error: unknown, tableName: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const parts = [
    "message" in error ? String(error.message ?? "") : "",
    "details" in error ? String(error.details ?? "") : "",
    "hint" in error ? String(error.hint ?? "") : "",
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");

  if (!parts) {
    return false;
  }

  return (
    parts.includes(`${tableName}.is_active`) ||
    parts.includes(`'is_active' column of '${tableName}'`) ||
    parts.includes(`relation "${tableName}"`) ||
    parts.includes(`relation '${tableName}'`)
  );
}

function hasBlankErrorMessage(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return false;
  }

  return String(error.message ?? "").trim().length === 0;
}

export function isMissingCategoriesIsActiveColumn(error: unknown): boolean {
  return (
    getMissingTableColumn(error, "categories") === "is_active" ||
    (getErrorCode(error) === "42703" && containsIsActiveReference(error, "categories"))
  );
}

export async function runCategoriesQuery<T>(
  buildQuery: (includeIsActiveFilter: boolean) => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T> & { usedLegacySchema: boolean }> {
  const initialResult = await buildQuery(true);

  const shouldRetryWithoutActiveFilter =
    isMissingCategoriesIsActiveColumn(initialResult.error) || hasBlankErrorMessage(initialResult.error);

  if (!shouldRetryWithoutActiveFilter) {
    return {
      ...initialResult,
      usedLegacySchema: false,
    };
  }

  console.warn(
    "categories.is_active filter failed; retrying category query without active filter for legacy schema compatibility.",
  );

  const fallbackResult = await buildQuery(false);
  return {
    ...fallbackResult,
    usedLegacySchema: true,
  };
}
