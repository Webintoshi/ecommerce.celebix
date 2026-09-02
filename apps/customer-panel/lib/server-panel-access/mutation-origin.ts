import { normalizeAdminRequestHostname, parseCanonicalAdminOriginFromPanelOrigin, parseExactAdminHttpsOrigin } from "@celebix/saas-data";

export function approvedPanelMutationOrigin(request: Request, panelOrigin: string): boolean {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin === panelOrigin) return true;

  const requestHostname = request.headers.get("host");
  if (requestOrigin === null || requestHostname === null) return false;

  try {
    return parseCanonicalAdminOriginFromPanelOrigin(requestOrigin, panelOrigin).hostname === requestHostname;
  } catch {
    try { return parseExactAdminHttpsOrigin(requestOrigin).hostname === normalizeAdminRequestHostname(requestHostname); }
    catch { return false; }
  }
}
