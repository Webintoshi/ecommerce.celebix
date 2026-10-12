export const ADMIN_PASSWORD_PROOF_RESOURCE = "urn:celebix:admin-signin-proof";
export const ADMIN_PASSWORD_PROOF_SCOPE = "signin:proof";
export const ADMIN_PASSWORD_PROOF_CLAIM = "celebix_admin_password_proof";

export type LogtoCustomizerInput = Readonly<{
  token?: unknown;
  context?: unknown;
  environmentVariables?: unknown;
  api?: unknown;
}>;
export type LogtoCustomizer = (input: LogtoCustomizerInput) => Record<string, unknown> | Promise<Record<string, unknown>>;

/** Pure and self-contained so its exact implementation can run in Logto's local VM. */
export function createAdminPasswordProofCustomizer(options: Readonly<{
  eligibleClientIds: readonly string[];
  previousCustomizer?: LogtoCustomizer;
}>): LogtoCustomizer {
  const resource = "urn:celebix:admin-signin-proof";
  const scope = "signin:proof";
  const claim = "celebix_admin_password_proof";
  const clients = new Set(options.eligibleClientIds);
  if (!clients.size || [...clients].some(x => typeof x !== "string" || !x || x.length > 256 || x.trim() !== x)) {
    throw new Error("admin_password_proof_config_invalid");
  }
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
  return async function getCustomJwtClaims(input) {
    const previous = options.previousCustomizer ? await options.previousCustomizer(input) : {};
    const token = object(input.token);
    // Existing scripts and claims are preserved for every other resource, including M2M.
    if (token.aud !== resource) return previous;
    const result = { ...previous };
    delete result[claim];
    const context = object(input.context);
    const user = object(context.user);
    const interaction = object(context.interaction);
    if (
      token.kind !== "AccessToken" || token.gty !== "authorization_code" ||
      !text(token.clientId) || !clients.has(token.clientId) ||
      typeof token.scope !== "string" || !token.scope.split(" ").includes(scope) ||
      !text(token.accountId) || token.accountId !== user.id || token.accountId !== interaction.userId ||
      interaction.interactionEvent !== "SignIn" || !Array.isArray(interaction.verificationRecords) ||
      !text(token.jti)
    ) return result;
    const verifiedPassword = interaction.verificationRecords.map(object).find(record => {
      const identifier = object(record.identifier);
      if (record.type !== "Password" || record.verified !== true || !text(identifier.value) ||
        typeof record.id !== "string" || !/^[a-z0-9]{21}$/.test(record.id)) return false;
      const identifiedValue = identifier.type === "email" ? user.primaryEmail :
        identifier.type === "phone" ? user.primaryPhone :
        identifier.type === "username" ? user.username :
        identifier.type === "userId" ? user.id : undefined;
      if (!text(identifiedValue)) return false;
      // Logto email lookup compares lower(value). The verified deployed username
      // policy is case-sensitive; username, phone and user ID stay exact.
      // Immutable signed ID AMR binds this record ID to the identified user.
      return identifier.type === "email"
        ? identifier.value.toLowerCase() === identifiedValue.toLowerCase()
        : identifier.value === identifiedValue;
    });
    if (!verifiedPassword) return result;
    result[claim] = { version: 3, method: "password", tokenId: token.jti, verificationId: verifiedPassword.id, subject: token.accountId, clientId: token.clientId };
    return result;
  };
}

/** ROOT reviews any existing script before using it here; this does not publish configuration. */
export function buildAdminPasswordProofCustomizerScript(options: Readonly<{
  eligibleClientIds: readonly string[];
  previousScript?: string;
}>): string {
  createAdminPasswordProofCustomizer(options);
  const previous = options.previousScript === undefined ? "undefined" :
    `(() => {\n${options.previousScript}\nreturn getCustomJwtClaims;\n})()`;
  return `const getCustomJwtClaims = (${createAdminPasswordProofCustomizer.toString()})({eligibleClientIds:${JSON.stringify(options.eligibleClientIds)},previousCustomizer:${previous}});`;
}
