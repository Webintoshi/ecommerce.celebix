const CUSTOMER_SIGN_IN_URL = "https://auth.celebix.co/sign-in?app_id=derycraft-storefront";
const CUSTOMER_REGISTER_URL = "https://auth.celebix.co/register?app_id=derycraft-storefront";

function sanitizeNextPath(nextPath?: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/hesap";
  }

  return nextPath;
}

export const CUSTOMER_AUTH_URLS = {
  signIn: CUSTOMER_SIGN_IN_URL,
  register: CUSTOMER_REGISTER_URL,
} as const;

export function buildProtectedSignInBridgePath(nextPath?: string | null) {
  const params = new URLSearchParams();
  params.set("next", sanitizeNextPath(nextPath));
  params.set("firstScreen", "sign_in");
  return `/api/auth/sign-in?${params.toString()}`;
}
