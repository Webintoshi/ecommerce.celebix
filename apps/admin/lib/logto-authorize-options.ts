export interface LogtoAuthorizeOptions {
  prompt?: "login";
  firstScreen?: "reset_password" | "identifier:sign-in";
  identifier?: string[];
  loginHint?: string | null;
  uiLocales?: string;
}

function setNonBlank(searchParams: URLSearchParams, name: string, value?: string | null) {
  const normalized = value?.trim();
  if (normalized) {
    searchParams.set(name, normalized);
  }
}

export function applyLogtoAuthorizeOptions(
  url: URL,
  options?: LogtoAuthorizeOptions,
): URL {
  if (!options) {
    return url;
  }

  setNonBlank(url.searchParams, "prompt", options.prompt);
  setNonBlank(url.searchParams, "first_screen", options.firstScreen);

  const identifier = options.identifier
    ?.map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
  setNonBlank(url.searchParams, "identifier", identifier);
  setNonBlank(url.searchParams, "login_hint", options.loginHint);
  setNonBlank(url.searchParams, "ui_locales", options.uiLocales);

  return url;
}
