function sanitizeNextPath(nextPath?: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/hesap";
  }

  return nextPath;
}

function buildCustomerAuthBridgePath(
  firstScreen: "sign_in" | "register",
  nextPath?: string | null,
) {
  const params = new URLSearchParams();
  params.set("next", sanitizeNextPath(nextPath));
  params.set("firstScreen", firstScreen);
  return `/api/auth/sign-in?${params.toString()}`;
}

export const CUSTOMER_AUTH_URLS = {
  signIn: buildCustomerAuthBridgePath("sign_in"),
  register: buildCustomerAuthBridgePath("register"),
} as const;

export function buildRegisterBridgePath(nextPath?: string | null) {
  return buildCustomerAuthBridgePath("register", nextPath);
}

export function buildProtectedSignInBridgePath(nextPath?: string | null) {
  return buildCustomerAuthBridgePath("sign_in", nextPath);
}
