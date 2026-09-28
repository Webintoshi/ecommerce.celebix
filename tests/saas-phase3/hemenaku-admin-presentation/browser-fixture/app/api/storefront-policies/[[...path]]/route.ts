import { GET as fallbackGET, PATCH as fallbackPATCH } from "../../[...slug]/route";

const NOW = "2026-09-09T12:00:00.000Z";
const DEFINITIONS = Object.freeze([
  Object.freeze({ key: "privacy_security", route: "/policies/privacy-security", label: "Gizlilik ve Güvenlik" }),
  Object.freeze({ key: "distance_sales", route: "/policies/distance-sales", label: "Mesafeli Satış Sözleşmesi" }),
  Object.freeze({ key: "kvkk", route: "/policies/kvkk", label: "KVKK" }),
  Object.freeze({ key: "payment_delivery", route: "/policies/payment-delivery", label: "Ödeme & Teslimat" }),
  Object.freeze({ key: "cookie_usage", route: "/policies/cookies", label: "Çerez Kullanımı" }),
  Object.freeze({ key: "returns_exchanges", route: "/policies/returns-exchanges", label: "İade & Değişim" }),
  Object.freeze({ key: "membership", route: "/policies/membership", label: "Üyelik" }),
]);

function policy(definition: (typeof DEFINITIONS)[number], index: number) {
  return Object.freeze({
    ...definition,
    ordinal: index + 1,
    status: index === 0 ? "published" : "draft",
    body: `# ${definition.label}\n\nYerel Mira kabul görünümü için kalıcı olmayan örnek içerik.`,
    version: 3,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function pathOf(context: { params: Promise<{ path?: string[] }> }) {
  return context.params.then(({ path }) => path?.join("/") ?? "");
}

function fallbackContext(path: string) {
  return { params: Promise.resolve({ slug: ["storefront-policies", ...path.split("/").filter(Boolean)] }) };
}

function inSettingsFixture(request: Request) {
  const source = request.headers.get("referer");
  if (!source) return false;
  try { return /^\/mira-settings(?:\/|$)/.test(new URL(source).pathname); }
  catch { return false; }
}

// This state belongs exclusively to the local presentation fixture. It has no
// store identity, live client, persistence adapter, or authentication boundary.
type LocalPage = ReturnType<typeof policy>;
type LocalState = {
  items: LocalPage[];
  changed: Set<string>;
  failedReads: Set<string>;
};
const localStates = new Map<string, LocalState>();

function localScope(request: Request) {
  try {
    const source = new URL(request.headers.get("referer") ?? "");
    if (source.pathname !== "/policies" && source.pathname !== "/content/policies") return null;
    const scenario = source.searchParams.get("scenario") ?? "normal";
    const session = source.searchParams.get("session") ?? "default";
    return { scenario, id: `${scenario}:${session}` };
  } catch { return null; }
}

function localState(id: string): LocalState {
  let state = localStates.get(id);
  if (!state) {
    state = {
      items: DEFINITIONS.map((definition, index) => ({
        ...policy(definition, index),
        status: index < 3 ? "published" : "draft",
        body: index === 0
          ? "# Gizlilik ve Güvenlik\n\nBu metin, yerel tasarım testine ait örnek içeriktir.\n\n## Verileriniz\n\n- Sipariş bilgileri\n- İletişim tercihleri\n\n**Canlı mağaza verisi içermez.**"
          : index === 3 ? "" : `# ${definition.label}\n\nYerel test metni. Bu içerik gerçek bir hukuki belge değildir.`,
      })),
      changed: new Set(),
      failedReads: new Set(),
    };
    localStates.set(id, state);
  }
  return state;
}

function localError(code: string, status: number) {
  return Response.json({ code }, { status });
}

async function localGET(path: string, scope: NonNullable<ReturnType<typeof localScope>>) {
  if (scope.scenario === "loading") await new Promise((resolve) => setTimeout(resolve, 1_200));
  if (scope.scenario === "list-error" && path === "") return localError("unavailable", 503);
  if (scope.scenario === "empty" && path === "") return Response.json({ items: [] });
  const state = localState(scope.id);
  if (path === "") return Response.json({ items: state.items });
  const selected = state.items.find(({ key }) => key === path);
  if (!selected) return localError("not_found", 404);
  if ((scope.scenario === "conflict-refresh-error" || scope.scenario === "commit-unknown")
    && state.changed.has(path) && !state.failedReads.has(path)) {
    state.failedReads.add(path);
    return localError("unavailable", 503);
  }
  return Response.json(selected);
}

async function localPATCH(request: Request, path: string, scope: NonNullable<ReturnType<typeof localScope>>) {
  const state = localState(scope.id);
  const index = state.items.findIndex(({ key }) => key === path);
  if (index < 0) return localError("not_found", 404);
  if (scope.scenario === "readonly") return localError("membership_denied", 403);
  if (scope.scenario === "save-error") return localError("unavailable", 503);
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return localError("invalid_input", 400); }
  const selected = state.items[index];
  if (typeof input.body !== "string" || input.body !== input.body.trim()
    || new TextEncoder().encode(input.body).byteLength > 100_000
    || (input.status !== "draft" && input.status !== "published")
    || (input.status === "published" && input.body.length === 0)
    || !Number.isSafeInteger(input.expectedVersion) || typeof input.operationId !== "string") {
    return localError("invalid_input", 400);
  }
  if ((scope.scenario === "conflict" || scope.scenario === "conflict-refresh-error") && !state.changed.has(path)) {
    state.changed.add(path);
    state.items[index] = { ...selected, body: "Başka oturumun yerel test metni.", version: selected.version + 1 };
    return localError("version_conflict", 409);
  }
  if (input.expectedVersion !== selected.version) return localError("version_conflict", 409);
  if (scope.scenario === "slow-save") await new Promise((resolve) => setTimeout(resolve, 1_200));
  const saved = { ...selected, body: input.body, status: input.status, version: selected.version + 1 };
  state.items[index] = saved;
  if (scope.scenario === "commit-unknown" && !state.changed.has(path)) {
    state.changed.add(path);
    return localError("commit_unknown", 503);
  }
  return Response.json(saved);
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await pathOf(context);
  const scope = localScope(request);
  if (scope) return localGET(path, scope);
  if (!inSettingsFixture(request)) return fallbackGET(request, fallbackContext(path));
  const items = DEFINITIONS.map(policy);
  if (path === "") return Response.json({ items });
  const selected = items.find(({ key }) => key === path);
  return selected
    ? Response.json(selected)
    : Response.json({ code: "not_found" }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await pathOf(context);
  const scope = localScope(request);
  if (scope) return localPATCH(request, path, scope);
  if (!inSettingsFixture(request)) return fallbackPATCH(request, fallbackContext(path));
  return DEFINITIONS.some(({ key }) => key === path)
    ? Response.json({ code: "version_conflict" }, { status: 409 })
    : Response.json({ code: "not_found" }, { status: 404 });
}
