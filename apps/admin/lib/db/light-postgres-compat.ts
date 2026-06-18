export function getDatabaseCompatibilityErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }

  return String(error || "");
}

export function isMissingDatabaseObjectError(error: unknown): boolean {
  const code = error && typeof error === "object"
    ? String((error as { code?: unknown }).code || "")
    : "";
  const message = getDatabaseCompatibilityErrorMessage(error).toLowerCase();

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("column") ||
    message.includes("compatibility table destegi bulunamadi")
  );
}

export function buildOptionalModuleDisabledPayload(module: string, message?: string) {
  return {
    optionalModule: module,
    enabled: false,
    disabled: true,
    disabledReason: message || "Bu opsiyonel modul bu magazada henuz etkin degil.",
  };
}
