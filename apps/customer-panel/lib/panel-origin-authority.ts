import { parseCanonicalAdminOriginFromPanelOrigin } from "@celebix/saas-data";

export function hasApprovedPanelMutationOriginShape(request: Request, panelOrigin: string): boolean {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin === panelOrigin) return true;
  if (requestOrigin === null) return false;
  try {
    parseCanonicalAdminOriginFromPanelOrigin(requestOrigin, panelOrigin);
    return true;
  } catch {
    return false;
  }
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
  } catch {
    return false;
  }
}

export function approvedPanelMutationOrigin(request: Request, panelOrigin: string): boolean {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin === panelOrigin) return true;
  const requestHostname = request.headers.get("host");
  if (requestOrigin === null || requestHostname === null) return false;
  try {
    return parseCanonicalAdminOriginFromPanelOrigin(requestOrigin, panelOrigin).hostname === requestHostname;
  } catch {
    return false;
  }
}
