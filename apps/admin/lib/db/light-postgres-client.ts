import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";

type LightPostgresRuntimeConfig = {
  connectionString: string;
  ssl: false | { rejectUnauthorized: false };
};

declare global {
  // eslint-disable-next-line no-var
  var __celebixAdminLightPostgresPool: Pool | undefined;
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function getScopedEnv(baseName: string): string | null {
  return (
    readEnv(`ADMIN_${baseName}`) ??
    readEnv(baseName)
  );
}

function buildConnectionString(rawUrl: string, databaseName: string | null): string {
  if (!databaseName) {
    return rawUrl;
  }

  const parsed = new URL(rawUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function resolveSslMode(
  value: string | null,
): false | { rejectUnauthorized: false } {
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
      "Light Postgres admin baglantisi icin LIGHT_POSTGRES_DATABASE_URL tanimli degil.",
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

function getLightPostgresPool(): Pool {
  if (!globalThis.__celebixAdminLightPostgresPool) {
    const config = getLightPostgresRuntimeConfig();

    globalThis.__celebixAdminLightPostgresPool = new Pool({
      connectionString: config.connectionString,
      ssl: config.ssl,
      max: 5,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      query_timeout: 15_000,
      application_name: "celebix-admin-light-postgres",
    });
  }

  return globalThis.__celebixAdminLightPostgresPool;
}

export async function queryLightPostgres<TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<TRow[]> {
  const pool = getLightPostgresPool();
  const result = await pool.query<TRow>(text, [...params]);
  return result.rows;
}

export async function queryLightPostgresOne<TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<TRow | null> {
  const [row] = await queryLightPostgres<TRow>(text, params);
  return row ?? null;
}

export async function withLightPostgresTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getLightPostgresPool().connect();

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
