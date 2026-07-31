import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import tls from "node:tls";

const DAY_MS = 86_400_000;
const BODY_LIMIT = 256 * 1_024;
const TIMEOUT_MS = 10_000;
const SHA256 = /^[a-f0-9]{64}$/;
const HOSTNAME = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function exactHostname(value) {
  if (typeof value !== "string" || value !== value.trim() || value !== value.toLowerCase() || !HOSTNAME.test(value)) {
    throw new Error("invalid_hostname");
  }
  return value;
}

export function parseSubjectAlternativeNames(value) {
  if (typeof value !== "string" || value.length > 16_384) return [];
  return Object.freeze(value.split(",").map((entry) => entry.trim()).flatMap((entry) => {
    if (!entry.startsWith("DNS:")) return [];
    const hostname = entry.slice(4);
    if (hostname.startsWith("*.")) {
      try { exactHostname(hostname.slice(2)); } catch { return []; }
      return hostname === hostname.toLowerCase() ? [hostname] : [];
    }
    try { return [exactHostname(hostname)]; } catch { return []; }
  }));
}

function patternCoversHostname(pattern, hostname) {
  if (pattern === hostname) return true;
  if (!pattern.startsWith("*.")) return false;
  const suffix = pattern.slice(2);
  if (!hostname.endsWith(`.${suffix}`)) return false;
  return hostname.slice(0, -(suffix.length + 1)).includes(".") === false;
}

export function certificateCoversHostname(subjectAlternativeName, rawHostname) {
  let hostname;
  try { hostname = exactHostname(rawHostname); } catch { return false; }
  return parseSubjectAlternativeNames(subjectAlternativeName).some((pattern) => patternCoversHostname(pattern, hostname));
}

export function certificateHealth(validTo, rawNow = new Date()) {
  const now = rawNow instanceof Date ? rawNow : new Date(Number.NaN);
  const expiresAt = typeof validTo === "string" ? Date.parse(validTo) : Number.NaN;
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(expiresAt)) {
    return Object.freeze({ kind: "invalid", remainingDays: null });
  }
  const remainingDays = Math.floor((expiresAt - now.getTime()) / DAY_MS);
  if (remainingDays < 14) return Object.freeze({ kind: "critical", remainingDays });
  if (remainingDays < 30) return Object.freeze({ kind: "warning", remainingDays });
  return Object.freeze({ kind: "healthy", remainingDays });
}

function expectedEnvironment(environment) {
  if (environment === "staging") {
    return Object.freeze({
      adminSuffix: ".admin.saas-staging.celebix.site",
      storefrontSuffix: ".saas-staging.celebix.site",
      adminWildcard: "*.admin.saas-staging.celebix.site",
      storefrontWildcard: "*.saas-staging.celebix.site",
      panelHostname: "panel.saas-staging.celebix.site",
      authHostname: "auth.saas-staging.celebix.site",
    });
  }
  if (environment === "production") {
    return Object.freeze({
      adminSuffix: ".admin.celebix.site",
      storefrontSuffix: ".celebix.site",
      adminWildcard: "*.admin.celebix.site",
      storefrontWildcard: "*.celebix.site",
      panelHostname: "panel.celebix.site",
      authHostname: "auth.celebix.site",
    });
  }
  throw new Error("invalid_environment");
}

function validProbe(probe) {
  return Boolean(
    probe && typeof probe === "object" &&
    typeof probe.status === "number" && Number.isSafeInteger(probe.status) &&
    typeof probe.bodySha256 === "string" && SHA256.test(probe.bodySha256) &&
    (() => { try { exactHostname(probe.hostname); return true; } catch { return false; } })(),
  );
}

export function evaluateTenantWildcardReadiness(input) {
  const errors = [];
  const warnings = [];
  let environment;
  let now;
  try {
    environment = expectedEnvironment(input?.environment);
    now = input.now instanceof Date && Number.isFinite(input.now.getTime()) ? new Date(input.now) : new Date();
  } catch {
    return Object.freeze({ ok: false, errors: Object.freeze(["readiness_input_invalid"]), warnings: Object.freeze([]) });
  }

  for (const role of ["admin", "storefront"]) {
    const certificate = Array.isArray(input.certificates)
      ? input.certificates.find((candidate) => candidate?.role === role)
      : null;
    const suffix = role === "admin" ? environment.adminSuffix : environment.storefrontSuffix;
    const wildcard = role === "admin" ? environment.adminWildcard : environment.storefrontWildcard;
    if (!certificate || (() => { try { return !exactHostname(certificate.hostname).endsWith(suffix); } catch { return true; } })()) {
      errors.push(`${role}_certificate_probe_invalid`);
      continue;
    }
    if (!certificateCoversHostname(certificate.subjectAltName, certificate.hostname)) {
      errors.push(`${role}_certificate_hostname_not_covered`);
    }
    if (!parseSubjectAlternativeNames(certificate.subjectAltName).includes(wildcard)) {
      errors.push(`${role}_certificate_wildcard_missing`);
    }
    const health = certificateHealth(certificate.validTo, now);
    if (health.kind === "critical" || health.kind === "invalid") {
      errors.push(`${role}_certificate_expiry_critical`);
    } else if (health.kind === "warning") {
      warnings.push(`${role}_certificate_expiry_warning`);
    }
  }

  const http = input?.http;
  const roles = ["knownAdmin", "knownStorefront", "unknownAdmin", "unknownStorefront", "panel", "auth"];
  if (!http || roles.some((role) => !validProbe(http[role]))) {
    errors.push("http_probe_invalid");
  } else {
    for (const role of ["knownAdmin", "knownStorefront"]) {
      if (http[role].status < 200 || http[role].status > 399) errors.push(`${role}_unhealthy`);
    }
    if (![404, 503].includes(http.unknownAdmin.status)) errors.push("unknown_admin_tenant_accepted");
    if (![404, 503].includes(http.unknownStorefront.status)) errors.push("unknown_storefront_tenant_accepted");
    if (http.panel.hostname !== environment.panelHostname || http.panel.status < 200 || http.panel.status > 399) {
      errors.push("panel_platform_host_unhealthy");
    }
    if (http.auth.hostname !== environment.authHostname || http.auth.status < 200 || http.auth.status > 399) {
      errors.push("auth_platform_host_unhealthy");
    }
    if (http.knownAdmin.bodySha256 === http.knownStorefront.bodySha256) {
      errors.push("admin_storefront_route_collision");
    }
    if (http.panel.bodySha256 === http.knownStorefront.bodySha256) {
      errors.push("panel_storefront_route_collision");
    }
    if (http.auth.bodySha256 === http.knownStorefront.bodySha256) {
      errors.push("auth_storefront_route_collision");
    }
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  });
}

function argumentsFrom(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--") || values.has(flag)) throw new Error("invalid_arguments");
    values.set(flag, value);
  }
  const environment = values.get("--environment");
  const knownAdmin = values.get("--known-admin");
  const knownStorefront = values.get("--known-storefront");
  if (!environment || !knownAdmin || !knownStorefront || values.size !== 3) throw new Error("invalid_arguments");
  const suffixes = expectedEnvironment(environment);
  exactHostname(knownAdmin);
  exactHostname(knownStorefront);
  const probeLabel = `wildcard-probe-${Date.now().toString(36)}`;
  return Object.freeze({
    environment,
    knownAdmin,
    knownStorefront,
    unknownAdmin: `${probeLabel}${suffixes.adminSuffix}`,
    unknownStorefront: `${probeLabel}${suffixes.storefrontSuffix}`,
    panel: suffixes.panelHostname,
    auth: suffixes.authHostname,
  });
}

async function readBoundedBody(response) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > BODY_LIMIT) throw new Error("response_body_too_large");
      chunks.push(Buffer.from(next.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks, total);
}

async function probeHttp(hostname, pathname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://${hostname}${pathname}`, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "Celebix-Wildcard-Readiness/1" },
    });
    const body = await readBoundedBody(response);
    return Object.freeze({
      hostname,
      status: response.status,
      bodySha256: createHash("sha256").update(body).digest("hex"),
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probeCertificate(role, hostname) {
  await lookup(hostname, { all: true, verbatim: true });
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    });
    const timer = setTimeout(() => socket.destroy(new Error("tls_timeout")), TIMEOUT_MS);
    const finish = (callback) => {
      clearTimeout(timer);
      callback();
    };
    socket.once("secureConnect", () => finish(() => {
      const certificate = socket.getPeerCertificate();
      const result = Object.freeze({
        role,
        hostname,
        subjectAltName: typeof certificate.subjectaltname === "string" ? certificate.subjectaltname : "",
        validTo: typeof certificate.valid_to === "string" ? new Date(certificate.valid_to).toISOString() : "",
        fingerprint256: typeof certificate.fingerprint256 === "string" ? certificate.fingerprint256 : null,
      });
      socket.end();
      resolve(result);
    }));
    socket.once("error", (error) => finish(() => reject(error)));
  });
}

export async function runTenantWildcardReadiness(rawArguments) {
  const config = argumentsFrom(rawArguments);
  const labels = [
    "adminCertificate",
    "storefrontCertificate",
    "knownAdmin",
    "knownStorefront",
    "unknownAdmin",
    "unknownStorefront",
    "panel",
    "auth",
  ];
  const settled = await Promise.allSettled([
    probeCertificate("admin", config.unknownAdmin),
    probeCertificate("storefront", config.unknownStorefront),
    probeHttp(config.knownAdmin, "/"),
    probeHttp(config.knownStorefront, "/"),
    probeHttp(config.unknownAdmin, "/"),
    probeHttp(config.unknownStorefront, "/"),
    probeHttp(config.panel, "/api/health"),
    probeHttp(config.auth, "/sign-in"),
  ]);
  const failures = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    const candidate = result.reason?.cause?.code ?? result.reason?.code ?? result.reason?.name;
    const code = typeof candidate === "string" && /^[A-Z0-9_]{2,80}$/i.test(candidate)
      ? candidate
      : "probe_failed";
    return [Object.freeze({ probe: labels[index], code })];
  });
  if (failures.length > 0) {
    return Object.freeze({
      ok: false,
      environment: config.environment,
      errors: Object.freeze(failures.map((failure) => `${failure.probe}_probe_failed`)),
      warnings: Object.freeze([]),
      probeFailures: Object.freeze(failures),
    });
  }
  const [adminCertificate, storefrontCertificate, knownAdmin, knownStorefront, unknownAdmin, unknownStorefront, panel, auth] = settled.map((result) => result.value);
  const result = evaluateTenantWildcardReadiness({
    environment: config.environment,
    now: new Date(),
    certificates: [adminCertificate, storefrontCertificate],
    http: { knownAdmin, knownStorefront, unknownAdmin, unknownStorefront, panel, auth },
  });
  return Object.freeze({
    ...result,
    environment: config.environment,
    probes: Object.freeze({
      adminCertificate,
      storefrontCertificate,
      http: Object.freeze({ knownAdmin, knownStorefront, unknownAdmin, unknownStorefront, panel, auth }),
    }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTenantWildcardReadiness(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: "wildcard_readiness_probe_failed", detail: error instanceof Error ? error.message : "unknown" })}\n`);
    process.exitCode = 1;
  });
}
