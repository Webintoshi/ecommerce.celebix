import { OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS, parseOwnerStagingAuthConfig } from "../self-serve-auth-authority/config.ts";
export function invitationOwnerConfig(source: Record<string, string | undefined>) {
  return parseOwnerStagingAuthConfig(Object.fromEntries(OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS.map(name => [name, source[name]])));
}
