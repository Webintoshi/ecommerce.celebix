import { normalizeAdminRequestHostname, parseCanonicalAdminOriginFromPanelOrigin, parseExactAdminHttpsOrigin } from "@celebix/saas-data";

function exactDirectCustomAdminOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin === null || host === null) return false;
  try {
    return parseExactAdminHttpsOrigin(origin).hostname === normalizeAdminRequestHostname(host);
  } catch { return false; }
}

export function hasApprovedPanelMutationOriginShape(request: Request, panelOrigin: string): boolean {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin === panelOrigin) return true;
  if (requestOrigin === null) return false;
  try {
    parseCanonicalAdminOriginFromPanelOrigin(requestOrigin, panelOrigin);
    return true;
  } catch { return exactDirectCustomAdminOrigin(request); }
}

export function approvedPanelMutationOriginForStore(
  request: Request,
  panelOrigin: string,
  storeSlug: string,
): boolean {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin === panelOrigin) return true;
  if (requestOrigin === null) return false;
  try {
    return parseCanonicalAdminOriginFromPanelOrigin(requestOrigin, panelOrigin).storeSlug === storeSlug;
  } catch { return exactDirectCustomAdminOrigin(request); }
}

export function approvedPanelMutationOrigin(request: Request, panelOrigin: string): boolean {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin === panelOrigin) return true;
  const requestHostname = request.headers.get("host");
  if (requestOrigin === null || requestHostname === null) return false;
  try {
    return parseCanonicalAdminOriginFromPanelOrigin(requestOrigin, panelOrigin).hostname === requestHostname;
  } catch { return exactDirectCustomAdminOrigin(request); }
}
