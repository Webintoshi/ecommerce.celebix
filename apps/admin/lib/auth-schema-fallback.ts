export class AuthSchemaUnavailableError extends Error {
  constructor() {
    super("Admin authorization schema is unavailable");
    this.name = "AuthSchemaUnavailableError";
  }
}

export async function resolveAuthSchemaFallback<T>(input: {
  readPrimary: () => Promise<T | null>;
  readLegacy: () => Promise<T | null>;
  isMissingSchemaError: (error: unknown) => boolean;
}): Promise<T | null> {
  let primarySchemaMissing = false;

  try {
    const primary = await input.readPrimary();
    if (primary) {
      return primary;
    }
  } catch (error) {
    if (!input.isMissingSchemaError(error)) {
      throw error;
    }
    primarySchemaMissing = true;
  }

  try {
    return await input.readLegacy();
  } catch (error) {
    if (!input.isMissingSchemaError(error)) {
      throw error;
    }

    if (primarySchemaMissing) {
      throw new AuthSchemaUnavailableError();
    }

    return null;
  }
}
