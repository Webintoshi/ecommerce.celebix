const PUBLIC_HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_HOSTNAME = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function validatedPublicOrigin(value: string | null | undefined): string | null {
  if (
    typeof value !== "string" || value.length === 0 || value.length > 2048 ||
    value.trim() !== value || value.includes(",") || /[\u0000-\u001f\u007f]/.test(value)
  ) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port ||
    url.pathname !== "/" || url.search || url.hash || url.origin !== value ||
    !PUBLIC_HOSTNAME.test(url.hostname) || IPV4_HOSTNAME.test(url.hostname) ||
    url.hostname.endsWith(".internal") || url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".localhost")
  ) return null;
  return value;
}

function forwardedPublicOrigin(request: Request): string | null {
  const protocol = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host");
  if (protocol !== "https" || host === null || host.trim() !== host) return null;
  return validatedPublicOrigin(`https://${host}`);
}

function requestPublicOrigin(request: Request): string | null {
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  if (url.username || url.password) return null;
  return validatedPublicOrigin(url.origin);
}

function resolvePublicOrigin(request: Request): string | null {
  return validatedPublicOrigin(process.env.CELEBIX_PANEL_ORIGIN) ??
    forwardedPublicOrigin(request) ??
    requestPublicOrigin(request);
}

export async function GET(request: Request) {
  const origin = resolvePublicOrigin(request);
  if (origin === null) {
    return Response.json(
      { code: "panel_auth_origin_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: `${origin}/login?auth=disabled`,
      "cache-control": "no-store",
    },
  });
}
