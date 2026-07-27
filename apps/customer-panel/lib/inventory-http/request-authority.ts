const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PRIVATE_EXACT = new Set([
  "authorization", "host", "forwarded", "x-forwarded-host", "x-forwarded-proto",
  "x-forwarded-port", "x-forwarded-for", "x-store-id", "x-tenant-id", "x-principal-id",
  "x-membership-id", "x-plan-id", "x-database-role", "x-database-url",
]);

export type InventoryRoute =
  | Readonly<{ kind: "locations"; method: "GET"; pathname: "/api/inventory/locations" }>
  | Readonly<{ kind: "location_save"; method: "POST"; pathname: "/api/inventory/locations" }>
  | Readonly<{ kind: "location_archive"; method: "POST"; pathname: string; id: string }>
  | Readonly<{ kind: "balances"; method: "GET"; pathname: "/api/inventory/balances" }>
  | Readonly<{ kind: "purchase_list"; method: "GET"; pathname: "/api/inventory/purchase-orders" }>
  | Readonly<{ kind: "purchase_save"; method: "POST"; pathname: "/api/inventory/purchase-orders" }>
  | Readonly<{ kind: "purchase_get"; method: "GET"; pathname: string; id: string }>
  | Readonly<{ kind: "purchase_transition" | "purchase_receive"; method: "POST"; pathname: string; id: string }>
  | Readonly<{ kind: "count_list"; method: "GET"; pathname: "/api/inventory/counts" }>
  | Readonly<{ kind: "count_save"; method: "POST"; pathname: "/api/inventory/counts" }>
  | Readonly<{ kind: "count_get"; method: "GET"; pathname: string; id: string }>
  | Readonly<{ kind: "count_start" | "count_commit" | "count_cancel"; method: "POST"; pathname: string; id: string }>
  | Readonly<{ kind: "transfer_list"; method: "GET"; pathname: "/api/inventory/transfers" }>
  | Readonly<{ kind: "transfer_save"; method: "POST"; pathname: "/api/inventory/transfers" }>
  | Readonly<{ kind: "transfer_get"; method: "GET"; pathname: string; id: string }>
  | Readonly<{ kind: "transfer_dispatch" | "transfer_receive" | "transfer_cancel"; method: "POST"; pathname: string; id: string }>;

export type InventoryRouteDecision =
  | Readonly<{ kind: "approved"; route: InventoryRoute }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "method_not_allowed"; allow: "GET" | "POST" | "GET, POST" }>;

function privateAuthority(request: Request): boolean {
  try {
    for (const [name] of request.headers) {
      if (PRIVATE_EXACT.has(name) || name.startsWith("x-celebix") || name.startsWith("x-forwarded-")) return true;
    }
    return false;
  } catch { return true; }
}

export function prepareInventoryRouteRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-port");
  headers.delete("x-forwarded-proto");
  headers.delete("x-forwarded-server");
  return new Request(request, { headers });
}

function route(pathname: string, method: string): InventoryRouteDecision {
  let allow: "GET" | "POST" | "GET, POST";
  let selected: InventoryRoute;
  if (pathname === "/api/inventory/locations") {
    allow = "GET, POST"; selected = method === "POST"
      ? { kind: "location_save", method: "POST", pathname }
      : { kind: "locations", method: "GET", pathname };
  } else if (pathname === "/api/inventory/balances") {
    allow = "GET"; selected = { kind: "balances", method: "GET", pathname };
  } else if (pathname === "/api/inventory/purchase-orders") {
    allow = "GET, POST";
    selected = method === "POST"
      ? { kind: "purchase_save", method: "POST", pathname }
      : { kind: "purchase_list", method: "GET", pathname };
  } else if (pathname === "/api/inventory/counts") {
    allow = "GET, POST";
    selected = method === "POST"
      ? { kind: "count_save", method: "POST", pathname }
      : { kind: "count_list", method: "GET", pathname };
  } else if (pathname === "/api/inventory/transfers") {
    allow = "GET, POST";
    selected = method === "POST"
      ? { kind: "transfer_save", method: "POST", pathname }
      : { kind: "transfer_list", method: "GET", pathname };
  } else {
    const location = new RegExp(`^/api/inventory/locations/(${UUID})/archive$`).exec(pathname);
    const purchase = new RegExp(`^/api/inventory/purchase-orders/(${UUID})(?:/(transition|receive))?$`).exec(pathname);
    const count = new RegExp(`^/api/inventory/counts/(${UUID})(?:/(start|commit|cancel))?$`).exec(pathname);
    const transfer = new RegExp(`^/api/inventory/transfers/(${UUID})(?:/(dispatch|receive|cancel))?$`).exec(pathname);
    if (location) {
      allow = "POST"; selected = { kind: "location_archive", method: "POST", pathname, id: location[1]! };
    } else if (purchase) {
      if (purchase[2]) {
        allow = "POST";
        selected = { kind: purchase[2] === "transition" ? "purchase_transition" : "purchase_receive", method: "POST", pathname, id: purchase[1]! };
      } else {
        allow = "GET";
        selected = { kind: "purchase_get", method: "GET", pathname, id: purchase[1]! };
      }
    } else if (count) {
      if (count[2]) {
        allow = "POST";
        selected = { kind: `count_${count[2]}` as "count_start" | "count_commit" | "count_cancel", method: "POST", pathname, id: count[1]! };
      } else {
        allow = "GET";
        selected = { kind: "count_get", method: "GET", pathname, id: count[1]! };
      }
    } else if (transfer) {
      if (transfer[2]) {
        allow = "POST";
        selected = { kind: `transfer_${transfer[2]}` as "transfer_dispatch" | "transfer_receive" | "transfer_cancel", method: "POST", pathname, id: transfer[1]! };
      } else {
        allow = "GET";
        selected = { kind: "transfer_get", method: "GET", pathname, id: transfer[1]! };
      }
    } else return Object.freeze({ kind: "not_found" });
  }
  return method === selected.method
    ? Object.freeze({ kind: "approved", route: Object.freeze(selected) })
    : Object.freeze({ kind: "method_not_allowed", allow });
}

export function classifyInventoryRequest(request: unknown): InventoryRouteDecision {
  try {
    if (!(request instanceof Request) || privateAuthority(request)) return Object.freeze({ kind: "invalid" });
    const url = new URL(request.url);
    if (
      !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash ||
      (request.method === "POST" && url.search !== "")
    ) {
      return Object.freeze({ kind: "invalid" });
    }
    return route(url.pathname, request.method);
  } catch { return Object.freeze({ kind: "invalid" }); }
}

export function inventoryOriginApproved(request: Request, panelOrigin: string): boolean {
  try {
    const origin = new URL(panelOrigin);
    return (
      origin.protocol === "https:" && !origin.username && !origin.password && !origin.port &&
      origin.pathname === "/" && !origin.search && !origin.hash && origin.origin === panelOrigin &&
      request.headers.get("origin") === panelOrigin
    );
  } catch { return false; }
}
