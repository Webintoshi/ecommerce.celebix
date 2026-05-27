export function isDerycraftLightPostgresRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const mode = (
    env.NEXT_PUBLIC_RUNTIME_DATABASE_MODE ??
    env.DATABASE_MODE ??
    ""
  ).trim().toLowerCase();
  const slug = (
    env.NEXT_PUBLIC_STORE_SLUG ??
    env.STORE_SLUG ??
    ""
  ).trim();

  return mode === "light_postgres" && slug === "derycraftcomtr";
}

export const DERYCRAFT_LIGHT_POSTGRES_RUNTIME = isDerycraftLightPostgresRuntime();

