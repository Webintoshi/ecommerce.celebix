#!/usr/bin/env node

const DEFAULT_TIMEOUT_MS = 8000;
const FORBIDDEN_PUBLIC_URL_PATTERNS = [
  /localhost/i,
  /0\.0\.0\.0/i,
  /127\.0\.0\.1/i,
  /:3000(?:\/|$)/i,
  /:3400(?:\/|$)/i,
];
const RAW_ERROR_PATTERNS = [
  /relation .* does not exist/i,
  /undefined_table/i,
  /missing table/i,
  /PostgREST/i,
  /PGRST\d+/i,
  /SQLSTATE/i,
  /database error/i,
];

function parseArgs(argv) {
  const args = { help: false, json: false, timeoutMs: DEFAULT_TIMEOUT_MS };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (token === "--json") {
      args.json = true;
      continue;
    }

    if (token === "--timeout-ms" || token === "--timeout") {
      args.timeoutMs = Number(argv[index + 1] ?? DEFAULT_TIMEOUT_MS);
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }

    positional.push(token);
  }

  args.slug = positional[0];
  return args;
}

function printUsage() {
  console.log("Usage: npm run smoke:store --workspace @celebix/owner -- <store-slug> [--json] [--timeout-ms N]");
  console.log("");
  console.log("Runs product-ready public smoke checks for a generated store on celebix.site.");
}

function ensureSlug(slug) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Usage: npm run smoke:store --workspace @celebix/owner -- <store-slug> [--json]");
  }

  return slug;
}

function buildUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

function hasForbiddenPublicUrl(value) {
  return FORBIDDEN_PUBLIC_URL_PATTERNS.some((pattern) => pattern.test(value));
}

function hasRawError(value) {
  return RAW_ERROR_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeLocation(location) {
  if (!location) {
    return null;
  }

  try {
    const url = new URL(location);
    const params = new URLSearchParams(url.search);

    for (const key of Array.from(params.keys())) {
      if (/token|secret|key|code|state/i.test(key)) {
        params.set(key, "[redacted]");
      }
    }

    url.search = params.toString();
    return url.toString();
  } catch {
    return location.replace(/(token|secret|key|code|state)=([^&]+)/gi, "$1=[redacted]");
  }
}

async function request(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const location = response.headers.get("location");
    const text = contentType.includes("text") || contentType.includes("json")
      ? await response.text()
      : "";

    return {
      ok: true,
      status: response.status,
      location,
      sanitizedLocation: sanitizeLocation(location),
      contentType,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      location: null,
      sanitizedLocation: null,
      contentType: "",
      text: "",
      error: error instanceof Error ? error.message : "request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function assertStatus(actual, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  return allowed.includes(actual);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function result({ category, id, target, expected, actual, pass, details }) {
  return {
    category,
    id,
    target,
    expected,
    actual,
    pass,
    details,
  };
}

async function checkHttp({ category, id, baseUrl, path, expectedStatus, timeoutMs }) {
  const url = buildUrl(baseUrl, path);
  const response = await request(url, timeoutMs);
  const rawError = hasRawError(response.text);
  const pass = response.ok && assertStatus(response.status, expectedStatus) && !rawError;

  return result({
    category,
    id,
    target: path,
    expected: `HTTP ${Array.isArray(expectedStatus) ? expectedStatus.join("/") : expectedStatus}`,
    actual: response.ok ? `HTTP ${response.status}` : response.error,
    pass,
    details: rawError ? "raw technical error detected" : undefined,
  });
}

async function checkRedirect({ category, id, baseUrl, path, expectedStatus, requireAuthHost, timeoutMs }) {
  const url = buildUrl(baseUrl, path);
  const response = await request(url, timeoutMs);
  const location = response.location || "";
  const sanitizedLocation = response.sanitizedLocation || "";
  const forbidden = hasForbiddenPublicUrl(location) || /placeholder|invalid_client/i.test(location);
  const authHostOk = requireAuthHost ? location.includes("auth.celebix.co/oidc/auth") : true;
  const pass =
    response.ok &&
    assertStatus(response.status, expectedStatus) &&
    authHostOk &&
    !forbidden;

  return result({
    category,
    id,
    target: path,
    expected: `HTTP ${Array.isArray(expectedStatus) ? expectedStatus.join("/") : expectedStatus} safe redirect`,
    actual: response.ok ? `HTTP ${response.status}${sanitizedLocation ? ` -> ${sanitizedLocation}` : ""}` : response.error,
    pass,
    details: forbidden ? "unsafe, placeholder, or invalid_client redirect detected" : undefined,
  });
}

async function checkRuntime({ category, id, baseUrl, expected, timeoutMs }) {
  const response = await request(buildUrl(baseUrl, "/api/public/runtime"), timeoutMs);
  const payload = parseJson(response.text);

  if (!response.ok || response.status !== 200 || !payload) {
    return result({
      category,
      id,
      target: "/api/public/runtime",
      expected: "runtime JSON 200",
      actual: response.ok ? `HTTP ${response.status}` : response.error,
      pass: false,
    });
  }

  const mismatches = Object.entries(expected).filter(([key, allowed]) => {
    const values = Array.isArray(allowed) ? allowed : [allowed];
    return !values.includes(payload[key]);
  });

  return result({
    category,
    id,
    target: "/api/public/runtime",
    expected: Object.entries(expected).map(([key, value]) => `${key}=${Array.isArray(value) ? value.join("|") : value}`).join(", "),
    actual: mismatches.length === 0 ? "matched" : mismatches.map(([key]) => `${key}=${payload[key] ?? "missing"}`).join(", "),
    pass: mismatches.length === 0,
  });
}

async function checkSecurityMetadata({ slug, storefrontUrl, adminUrl, timeoutMs }) {
  const urls = [storefrontUrl, adminUrl];
  const runtimeResponses = await Promise.all([
    request(buildUrl(storefrontUrl, "/api/public/runtime"), timeoutMs),
    request(buildUrl(adminUrl, "/api/public/runtime"), timeoutMs),
  ]);

  for (const response of runtimeResponses) {
    if (response.text) {
      urls.push(response.text);
    }
  }

  const leaked = urls.find((value) => hasForbiddenPublicUrl(value));
  const secretLike = urls.find((value) => /service_role|secret|access_key|token/i.test(value));
  const supabaseResource = urls.find((value) => /supabaseStatus"\s*:\s*"(?!none)/i.test(value));

  return result({
    category: "supabase_absence",
    id: "security_metadata",
    target: slug,
    expected: "no dev URL, no secret-like metadata, supabaseStatus=none",
    actual: leaked ? "unsafe URL metadata" : secretLike ? "secret-like metadata" : supabaseResource ? "Supabase metadata drift" : "clean",
    pass: !leaked && !secretLike && !supabaseResource,
  });
}

async function runSmoke(slug, timeoutMs) {
  const storefrontUrl = `https://${slug}.celebix.site`;
  const adminUrl = `https://admin-${slug}.celebix.site`;
  const checks = [];

  for (const path of ["/", "/urunler", "/odeme", "/blog", "/giris", "/kayit", "/sifremi-unuttum", "/api/public/runtime", "/api/public/payments"]) {
    checks.push(await checkHttp({ category: "storefront", id: `storefront_${path}`, baseUrl: storefrontUrl, path, expectedStatus: 200, timeoutMs }));
  }

  checks.push(await checkHttp({ category: "auth", id: "account_401", baseUrl: storefrontUrl, path: "/api/account", expectedStatus: 401, timeoutMs }));
  checks.push(await checkHttp({ category: "storefront", id: "missing_product_404", baseUrl: storefrontUrl, path: "/urunler/aqa-missing-slug-404-check", expectedStatus: 404, timeoutMs }));
  checks.push(await checkHttp({ category: "storefront", id: "missing_blog_404", baseUrl: storefrontUrl, path: "/blog/aqa-missing-blog-404-check", expectedStatus: 404, timeoutMs }));
  checks.push(await checkRuntime({
    category: "storefront",
    id: "storefront_runtime_standard",
    baseUrl: storefrontUrl,
    expected: {
      databaseMode: "light_postgres",
      storageProvider: "r2",
      analyticsProvider: "umami",
      supabaseStatus: "none",
      customerAuthStatus: ["ready", "configured", "logto_stable"],
    },
    timeoutMs,
  }));

  checks.push(await checkRedirect({
    category: "auth",
    id: "customer_email_sign_in",
    baseUrl: storefrontUrl,
    path: "/api/auth/sign-in?next=%2Fhesap&firstScreen=sign_in",
    expectedStatus: 307,
    requireAuthHost: true,
    timeoutMs,
  }));
  checks.push(await checkRedirect({
    category: "auth",
    id: "customer_google_sign_in",
    baseUrl: storefrontUrl,
    path: "/api/auth/sign-in?next=%2Fhesap&directSignIn=social:google",
    expectedStatus: 307,
    requireAuthHost: true,
    timeoutMs,
  }));
  checks.push(await checkRedirect({
    category: "auth",
    id: "customer_forgot_password",
    baseUrl: storefrontUrl,
    path: "/api/auth/sign-in?firstScreen=reset_password&identifier=email",
    expectedStatus: 307,
    requireAuthHost: true,
    timeoutMs,
  }));
  checks.push(await checkRedirect({
    category: "auth",
    id: "customer_fake_callback",
    baseUrl: storefrontUrl,
    path: "/callback?code=fake&state=fake",
    expectedStatus: [200, 302, 307, 400, 401],
    requireAuthHost: false,
    timeoutMs,
  }));
  checks.push(await checkHttp({
    category: "auth",
    id: "customer_sign_out",
    baseUrl: storefrontUrl,
    path: "/api/auth/sign-out",
    expectedStatus: [200, 204, 302, 307, 401],
    timeoutMs,
  }));

  checks.push(await checkHttp({ category: "admin", id: "admin_login_200", baseUrl: adminUrl, path: "/admin/login", expectedStatus: 200, timeoutMs }));
  checks.push(await checkHttp({ category: "admin", id: "admin_runtime_200", baseUrl: adminUrl, path: "/api/public/runtime", expectedStatus: 200, timeoutMs }));
  checks.push(await checkRuntime({
    category: "admin",
    id: "admin_runtime_standard",
    baseUrl: adminUrl,
    expected: {
      databaseMode: "light_postgres",
      authProvider: "logto",
      authStrategy: "logto_oidc_bridge_v1",
    },
    timeoutMs,
  }));
  checks.push(await checkRedirect({
    category: "admin",
    id: "admin_sign_in",
    baseUrl: adminUrl,
    path: "/api/auth/sign-in?next=%2Fadmin",
    expectedStatus: 307,
    requireAuthHost: true,
    timeoutMs,
  }));
  checks.push(await checkRedirect({
    category: "admin",
    id: "admin_fake_callback",
    baseUrl: adminUrl,
    path: "/callback?code=fake&state=fake",
    expectedStatus: [200, 302, 307, 400, 401],
    requireAuthHost: false,
    timeoutMs,
  }));

  const optionalModules = [
    ["quick_order", "/admin/siparisler/hizli-siparis"],
    ["coupons_discounts", "/admin/indirimler"],
    ["lucky_wheel", "/admin/indirimler/sans-carki"],
    ["marketplace", "/admin/markets"],
    ["accounting", "/admin/muhasebe"],
  ];

  for (const [id, path] of optionalModules) {
    checks.push(await checkHttp({ category: "optional_modules", id, baseUrl: adminUrl, path, expectedStatus: [200, 302, 307, 401, 403, 404], timeoutMs }));
  }

  checks.push(await checkSecurityMetadata({ slug, storefrontUrl, adminUrl, timeoutMs }));

  const passed = checks.filter((check) => check.pass).length;
  const failed = checks.length - passed;

  return {
    storeSlug: slug,
    startedAt: new Date().toISOString(),
    mode: "execute",
    overallStatus: failed === 0 ? "passed" : passed > 0 ? "partial" : "failed",
    summary: { passed, failed, total: checks.length },
    checks,
  };
}

function printHuman(report) {
  console.log(`Store smoke: ${report.storeSlug}`);
  console.log(`Overall: ${report.overallStatus} (${report.summary.passed}/${report.summary.total} passed)`);

  for (const check of report.checks) {
    const marker = check.pass ? "PASS" : "FAIL";
    console.log(`${marker} [${check.category}] ${check.id}: expected ${check.expected}; actual ${check.actual}`);
    if (check.details) {
      console.log(`  ${check.details}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const slug = ensureSlug(args.slug);
  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : DEFAULT_TIMEOUT_MS;
  const report = await runSmoke(slug, timeoutMs);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  process.exitCode = report.summary.failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Smoke runner failed.");
  process.exitCode = 1;
});
