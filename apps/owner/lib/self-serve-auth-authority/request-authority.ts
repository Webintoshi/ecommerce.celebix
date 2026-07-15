const PUBLIC_REGISTRATION_PATH = "/api/self-serve/register";

interface PublicRegistrationRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Pick<Headers, "get">;
}

function validatePublicRegistrationRequestAuthority(
  request: PublicRegistrationRequest,
  publicOrigin: string,
): boolean {
  if (request.method !== "POST") return false;
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin || rawOrigin !== publicOrigin) return false;
  try {
    const origin = new URL(rawOrigin);
    if (
      origin.protocol !== "https:" ||
      rawOrigin !== origin.origin ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) return false;
    const target = new URL(request.url);
    return target.pathname === PUBLIC_REGISTRATION_PATH && !target.search && !target.hash;
  } catch {
    return false;
  }
}

Object.freeze(validatePublicRegistrationRequestAuthority);

export const publicRegistrationRequestAuthority = Object.freeze({
  validate: validatePublicRegistrationRequestAuthority,
});
