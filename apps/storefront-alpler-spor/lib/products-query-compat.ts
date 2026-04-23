type QueryResult<T> = {
  data: T;
  error: unknown;
  count?: number | null;
};

function getMissingTableColumn(error: unknown, tableName: string): string | null {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return null;
  }

  const message = String(error.message ?? "");

  const schemaCacheMatch = message.match(
    new RegExp(`Could not find the '([^']+)' column of '${tableName}'`, "i")
  );
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  const qualifiedMatch = message.match(
    new RegExp(`column\\s+${tableName}\\.([a-zA-Z0-9_]+)\\s+does not exist`, "i")
  );
  if (qualifiedMatch?.[1]) {
    return qualifiedMatch[1];
  }

  const relationMatch = message.match(
    new RegExp(`column [\"']([^\"']+)[\"'] of relation [\"']${tableName}[\"'] does not exist`, "i")
  );
  return relationMatch?.[1] ?? null;
}

function hasBlankErrorMessage(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return false;
  }

  return String(error.message ?? "").trim().length === 0;
}

export function isMissingProductsIsActiveColumn(error: unknown): boolean {
  return getMissingTableColumn(error, "products") === "is_active";
}

export async function runProductsQuery<T>(
  buildQuery: (includeIsActiveFilter: boolean) => PromiseLike<QueryResult<T>>
): Promise<QueryResult<T> & { usedLegacySchema: boolean }> {
  const initialResult = await buildQuery(true);

  const shouldRetryWithoutActiveFilter =
    isMissingProductsIsActiveColumn(initialResult.error) || hasBlankErrorMessage(initialResult.error);

  if (!shouldRetryWithoutActiveFilter) {
    return {
      ...initialResult,
      usedLegacySchema: false,
    };
  }

  console.warn(
    "products.is_active filter failed; retrying product query without active filter for legacy schema compatibility."
  );

  const fallbackResult = await buildQuery(false);
  return {
    ...fallbackResult,
    usedLegacySchema: true,
  };
}
