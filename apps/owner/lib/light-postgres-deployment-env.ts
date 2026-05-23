import "server-only";

import {
  resolveLightPostgresDefaultSslMode,
  type StoreConfig,
} from "@celebix/platform-config";

type EnvMap = Record<string, string>;

export interface ResolvedLightPostgresDeploymentEnv {
  runtimeDatabaseName: string;
  runtimeDatabaseUrl: string | null;
  runtimeSslMode: string;
}

function readEnvValue(
  envMap: EnvMap,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = envMap[key]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function buildRuntimeDatabaseUrl(databaseName: string): string | null {
  const template = process.env.LIGHT_POSTGRES_DATABASE_URL_TEMPLATE?.trim();

  if (!template) {
    return null;
  }

  return template.replace(/\$\{database\}/g, databaseName);
}

export function resolveLightPostgresDeploymentEnv(
  store: StoreConfig,
  envMap: EnvMap = {},
): ResolvedLightPostgresDeploymentEnv {
  const runtimeDatabaseName =
    readEnvValue(envMap, ["LIGHT_POSTGRES_DATABASE_NAME", "STORE_SLUG"]) ||
    store.lightPostgres?.databaseName?.trim() ||
    store.slug;
  const runtimeDatabaseUrl =
    readEnvValue(envMap, [
      "LIGHT_POSTGRES_DATABASE_URL",
      "DATABASE_URL",
      "DATABASE_DIRECT_URL",
    ]) || buildRuntimeDatabaseUrl(runtimeDatabaseName);
  const runtimeSslMode =
    readEnvValue(envMap, [
      "LIGHT_POSTGRES_DATABASE_SSLMODE",
      "DATABASE_SSLMODE",
    ]) || resolveLightPostgresDefaultSslMode();

  return {
    runtimeDatabaseName,
    runtimeDatabaseUrl,
    runtimeSslMode,
  };
}
