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

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await pathOf(context);
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
  if (!inSettingsFixture(request)) return fallbackPATCH(request, fallbackContext(path));
  return DEFINITIONS.some(({ key }) => key === path)
    ? Response.json({ code: "version_conflict" }, { status: 409 })
    : Response.json({ code: "not_found" }, { status: 404 });
}
