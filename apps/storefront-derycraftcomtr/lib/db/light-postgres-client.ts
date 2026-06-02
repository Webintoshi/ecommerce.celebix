import "server-only";

type LightPostgresRuntimeConfig = {
  connectionString: string;
  ssl: false | { rejectUnauthorized: false };
};

type QueryRow = Record<string, unknown>;

type PgResult<TRow extends QueryRow = QueryRow> = {
  rows: TRow[];
};

type PgPoolClient = {
  query: <TRow extends QueryRow = QueryRow>(
    text: string,
    params?: unknown[],
  ) => Promise<PgResult<TRow>>;
  release: () => void;
};

type PgPool = {
  query: <TRow extends QueryRow = QueryRow>(
    text: string,
    params?: unknown[],
  ) => Promise<PgResult<TRow>>;
  connect: () => Promise<PgPoolClient>;
};

type PgModule = {
  Pool: new (config: {
    connectionString: string;
    ssl: false | { rejectUnauthorized: false };
    max: number;
    idleTimeoutMillis: number;
    statement_timeout: number;
    query_timeout: number;
    application_name: string;
  }) => PgPool;
};

declare global {
  // eslint-disable-next-line no-var
  var __celebixStorefrontLightPostgresPool: PgPool | undefined;
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function getScopedEnv(baseName: string): string | null {
  return readEnv(`STOREFRONT_${baseName}`) ?? readEnv(baseName);
}

function buildConnectionString(rawUrl: string, databaseName: string | null): string {
  if (!databaseName) {
    return rawUrl;
  }

  const parsed = new URL(rawUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function resolveSslMode(value: string | null): false | { rejectUnauthorized: false } {
  if (!value) {
    return { rejectUnauthorized: false };
  }

  return value.toLowerCase() === "disable"
    ? false
    : { rejectUnauthorized: false };
}

function getLightPostgresRuntimeConfig(): LightPostgresRuntimeConfig {
  const rawUrl = getScopedEnv("LIGHT_POSTGRES_DATABASE_URL");

  if (!rawUrl) {
    throw new Error(
      "Light Postgres storefront baglantisi icin LIGHT_POSTGRES_DATABASE_URL tanimli degil.",
    );
  }

  return {
    connectionString: buildConnectionString(
      rawUrl,
      getScopedEnv("LIGHT_POSTGRES_DATABASE_NAME"),
    ),
    ssl: resolveSslMode(getScopedEnv("LIGHT_POSTGRES_DATABASE_SSLMODE")),
  };
}

async function loadPgModule(): Promise<PgModule> {
  const dynamicImport = new Function("return import('pg')") as () => Promise<PgModule>;
  return dynamicImport();
}

async function getLightPostgresPool(): Promise<PgPool> {
  if (!globalThis.__celebixStorefrontLightPostgresPool) {
    const config = getLightPostgresRuntimeConfig();
    const { Pool } = await loadPgModule();

    globalThis.__celebixStorefrontLightPostgresPool = new Pool({
      connectionString: config.connectionString,
      ssl: config.ssl,
      max: 5,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      query_timeout: 15_000,
      application_name: "celebix-storefront-light-postgres",
    });
  }

  return globalThis.__celebixStorefrontLightPostgresPool;
}

export async function queryLightPostgres<TRow extends QueryRow = QueryRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<TRow[]> {
  const pool = await getLightPostgresPool();
  const result = await pool.query<TRow>(text, [...params]);
  return result.rows;
}

export async function queryLightPostgresOne<TRow extends QueryRow = QueryRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<TRow | null> {
  const [row] = await queryLightPostgres<TRow>(text, params);
  return row ?? null;
}

export async function withLightPostgresTransaction<T>(
  callback: (client: PgPoolClient) => Promise<T>,
): Promise<T> {
  const client = await (await getLightPostgresPool()).connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failures.
    }

    throw error;
  } finally {
    client.release();
  }
}
