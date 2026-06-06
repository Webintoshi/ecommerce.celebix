const CUSTOMER_AUTH_BASE_URL = "https://auth.celebix.co";
const CUSTOMER_AUTH_APP_ID = "derycraft-storefront";

function buildExternalAuthUrl(pathname: "/sign-in" | "/register") {
  const url = new URL(pathname, CUSTOMER_AUTH_BASE_URL);
  url.searchParams.set("app_id", CUSTOMER_AUTH_APP_ID);
  return url.toString();
}

function sanitizeNextPath(nextPath?: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/hesap";
  }

  return nextPath;
}

export const CUSTOMER_AUTH_URLS = {
  signIn: buildExternalAuthUrl("/sign-in"),
  register: buildExternalAuthUrl("/register"),
} as const;

export function buildProtectedSignInBridgePath(nextPath?: string | null) {
  const params = new URLSearchParams();
  params.set("next", sanitizeNextPath(nextPath));
  params.set("firstScreen", "sign_in");
  return `/api/auth/sign-in?${params.toString()}`;
}
