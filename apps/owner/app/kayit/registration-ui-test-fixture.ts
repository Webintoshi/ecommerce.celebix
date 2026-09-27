import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { rootCertificates } from "node:tls";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const ownerRoot = fileURLToPath(new URL("../../", import.meta.url));

export interface UiElement {
  type: unknown;
  props: Record<string, unknown>;
}

export function approvedRegistrationEnvironment(suffix = "saas-staging.celebix.net") {
  const environment: Record<string, string | undefined> = {
    CELEBIX_SAAS_AUTH_MODE: "approved_staging",
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_STAGING_ACTIVATION_ID: "staging_registration_ui_test",
    CELEBIX_OWNER_ORIGIN: "https://owner.staging.example.test",
    CELEBIX_PANEL_ORIGIN: "https://panel.staging.example.test",
    CELEBIX_PLATFORM_DOMAIN_SUFFIX: suffix,
    CELEBIX_SAAS_DATABASE_URL: "postgresql://fixture:fixture@db.example.test/celebix_saas_staging_ui?sslmode=verify-full",
    CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_ui",
    CELEBIX_STAGING_DB_CA_B64: Buffer.from(rootCertificates[0]).toString("base64"),
    CELEBIX_LOGTO_ISSUER: "https://identity.example.test/oidc",
    CELEBIX_LOGTO_DISCOVERY_URL: "https://identity.example.test/oidc/.well-known/openid-configuration",
    CELEBIX_LOGTO_CLIENT_ID: "registration-ui-fixture",
    CELEBIX_LOGTO_CLIENT_SECRET: "registration-ui-fixture",
    CELEBIX_LOGTO_TOKEN_AUTH_METHOD: "client_secret_basic",
    CELEBIX_LOGTO_ID_TOKEN_ALGS: "ES384",
    CELEBIX_IDENTITY_HMAC_KEY_B64URL: Buffer.alloc(32, 1).toString("base64url"),
    CELEBIX_IDENTITY_ENCRYPTION_KEY_ID: "identity.ui.test",
    CELEBIX_IDENTITY_ENCRYPTION_KEY_B64URL: Buffer.alloc(32, 2).toString("base64url"),
  };
  for (const [index, group] of ["BROWSER_BOOTSTRAP", "BROWSER_BINDING", "BROWSER_INTERNAL", "CALLBACK_INTERNAL", "HANDOFF", "SESSION"].entries()) {
    environment[`CELEBIX_${group}_KEY_ID`] = `${group.toLowerCase()}.ui.test`;
    environment[`CELEBIX_${group}_KEY_B64URL`] = Buffer.alloc(32, index + 3).toString("base64url");
  }
  return environment;
}

// Compile the actual JSX components while keeping their process.env isolated from
// the machine running tests. The strict registration resolver remains real.
export function registrationUiFixture(environment: Record<string, string | undefined>) {
  const modules = new Map<string, Record<string, unknown>>();
  function load(filename: string): Record<string, unknown> {
    const cached = modules.get(filename);
    if (cached) return cached;
    const module = { exports: {} as Record<string, unknown> };
    modules.set(filename, module.exports);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    runInNewContext(compiled, {
      module,
      exports: module.exports,
      Buffer,
      URL,
      require(specifier: string) {
        if (specifier === "node:process") return { env: environment };
        // Next Link needs a router context unavailable in the node:test server
        // condition. Navigation is outside these registration-state checks.
        if (specifier === "next/link") return "a";
        if (specifier.startsWith("@/")) {
          const local = path.join(ownerRoot, specifier.slice(2));
          return load(`${local}${specifier.includes("components/") ? ".tsx" : ".ts"}`);
        }
        if (specifier.startsWith(".")) return load(path.resolve(path.dirname(filename), specifier));
        return require(specifier);
      },
    }, { filename });
    return module.exports;
  }
  const form = load(path.join(ownerRoot, "components/self-serve/SelfServeDirectRegistrationForm.tsx"))
    .SelfServeDirectRegistrationForm as (props: { enabled: boolean; domainSuffix?: string }) => UiElement;
  const page = load(path.join(ownerRoot, "app/kayit/page.tsx")).default as () => UiElement;

  function elements(node: unknown): UiElement[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as UiElement;
    if (element.type === form) return elements(form(element.props as Parameters<typeof form>[0]));
    return [element, ...elements(element.props.children)];
  }
  function text(node: unknown): string {
    if (Array.isArray(node)) return node.map(text).join("");
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (!node || typeof node !== "object" || !("props" in node)) return "";
    const element = node as UiElement;
    if (element.type === form) return text(form(element.props as Parameters<typeof form>[0]));
    return text(element.props.children);
  }
  return { page, form, elements, text };
}
