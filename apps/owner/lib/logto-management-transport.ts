export interface LogtoManagementTransport {
  request<T>(pathname: string, init?: RequestInit): Promise<T>;
}

export function normalizeLogtoManagementApiPath(pathname: string): string {
  const normalized = pathname.trim();
  const withoutApiPrefix = normalized.replace(/^\/api(?=\/|$)/, "");
  return withoutApiPrefix.startsWith("/")
    ? withoutApiPrefix
    : `/${withoutApiPrefix}`;
}
