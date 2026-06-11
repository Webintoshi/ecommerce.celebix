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

function buildLightPostgresRoleName(databaseName: string): string {
  const normalized = databaseName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 46);
  return `celebix_store_${normalized || "store"}`;
}

function buildRuntimeDatabaseUrl(databaseName: string): string | null {
  const template =
    process.env.LIGHT_POSTGRES_RUNTIME_DATABASE_URL_TEMPLATE?.trim() ||
    process.env.LIGHT_POSTGRES_DATABASE_URL_TEMPLATE?.trim();
  const roleName = buildLightPostgresRoleName(databaseName);
  const rolePassword = process.env.LIGHT_POSTGRES_STORE_ROLE_PASSWORD_TEMPLATE
    ?.trim()
    .replace(/\$\{database\}/g, databaseName)
    .replace(/\$\{role\}/g, roleName);

  if (!template || !rolePassword) {
    return null;
  }

  return template
    .replace(/\$\{database\}/g, databaseName)
    .replace(/\$\{role\}/g, encodeURIComponent(roleName))
    .replace(/\$\{password\}/g, encodeURIComponent(rolePassword));
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
