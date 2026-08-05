import {
  PANEL_BROWSER_BOOTSTRAP_URL,
  PANEL_OIDC_CALLBACK_URL,
} from "../../../../packages/platform-config/src/saas.ts";
import type { OpaqueStateDigester } from "../saas-persistence/identity-crypto.ts";
import type { SelfServeRegistrationStartInput } from "../self-serve-registration-orchestrator.ts";
import {
  assertPersistentSelfServeRuntime,
  type PersistentSelfServeRuntime,
} from "../self-serve-http/runtime.ts";
import type { PanelBrowserBindingAuthorityCodec } from "./credential-codec.ts";
import type {
  PanelBrowserBootstrapResult,
  PostgresPanelBrowserBindingRepository,
} from "./postgres-repository.ts";

const DIGEST = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAXIMUM_BOOTSTRAP_MS = 5 * 60_000;

type Audit = (event: Readonly<{
  stage: "registration" | "provider_authority" | "bootstrap";
  outcome: "completed" | "rejected" | "unavailable";
}>) => void | Promise<void>;

export type PanelBrowserBindingRegistrationStartResult = Readonly<{
  bootstrapCredential: string;
  providerAuthorizationUrl: string;
  panelBootstrapAuthority: string;
  bootstrapExpiresAt: string;
}>;

function invalid(): never {
  throw new Error("panel_browser_binding_start_unavailable");
}

function now(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" || value.length > 32 || value.trim() !== value) invalid();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) invalid();
  return milliseconds;
}

function exactSingle(search: URLSearchParams, name: string, maximum: number): string {
  const values = search.getAll(name);
  const value = values[0];
  if (
    values.length !== 1 || !value || value.trim() !== value || value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) invalid();
  return value;
}

function exactProviderAuthority(value: unknown, callbackAuthority: string): { url: string; state: string } {
  if (typeof value !== "string" || value.length < 1 || value.length > 16_384 || value.trim() !== value) invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
    url.toString() !== value
  ) invalid();
  const state = exactSingle(url.searchParams, "state", 1_024);
  if (state.length < 16) invalid();
  if (exactSingle(url.searchParams, "redirect_uri", 2_048) !== callbackAuthority) invalid();
  if (exactSingle(url.searchParams, "response_type", 32) !== "code") invalid();
  if (exactSingle(url.searchParams, "response_mode", 32) !== "query") invalid();
  return { url: value, state };
}

function auditSafely(audit: Audit, event: Parameters<Audit>[0]): void {
  try { void Promise.resolve(audit(Object.freeze({ ...event }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

export function createPanelBrowserBindingRegistrationStartExecutor(input: {
  runtime: PersistentSelfServeRuntime;
  stateDigester: OpaqueStateDigester;
  credentialCodec: PanelBrowserBindingAuthorityCodec;
  repository: Pick<PostgresPanelBrowserBindingRepository, "createBootstrap">;
  panelBootstrapAuthority: string;
  panelCallbackAuthority?: string;
  clock(): Date;
  randomUuid(): string;
  audit: Audit;
}) {
  if (!input) invalid();
  assertPersistentSelfServeRuntime(input.runtime);
  if (!input.stateDigester || typeof input.stateDigester.digest !== "function" ||
      !input.credentialCodec || typeof input.credentialCodec.generateBootstrapCredential !== "function" ||
      !input.repository || typeof input.repository.createBootstrap !== "function" ||
      typeof input.panelBootstrapAuthority !== "string" ||
      typeof input.clock !== "function" || typeof input.randomUuid !== "function" || typeof input.audit !== "function") invalid();
  now(input.clock);
  const panelBootstrapAuthority = input.panelBootstrapAuthority;
  const panelCallbackAuthority = input.panelCallbackAuthority ?? PANEL_OIDC_CALLBACK_URL;
  try {
    const bootstrap = new URL(panelBootstrapAuthority);
    const callback = new URL(panelCallbackAuthority);
    if (
      bootstrap.protocol !== "https:" || bootstrap.username || bootstrap.password || bootstrap.port ||
      bootstrap.pathname !== "/auth/bootstrap" || bootstrap.search || bootstrap.hash ||
      `${bootstrap.origin}${bootstrap.pathname}` !== panelBootstrapAuthority ||
      callback.protocol !== "https:" || callback.username || callback.password || callback.port ||
      callback.pathname !== "/auth/callback" || callback.search || callback.hash ||
      `${callback.origin}${callback.pathname}` !== panelCallbackAuthority ||
      bootstrap.origin !== callback.origin
    ) invalid();
  } catch { return invalid(); }
  const runtime = input.runtime;
  const digestState = input.stateDigester.digest.bind(input.stateDigester);
  const generateBootstrapCredential = input.credentialCodec.generateBootstrapCredential.bind(input.credentialCodec);
  const createBootstrap = input.repository.createBootstrap.bind(input.repository);
  const clock = input.clock;
  const randomUuid = input.randomUuid;
  const audit = input.audit;

  return Object.freeze({
    async execute(registration: SelfServeRegistrationStartInput): Promise<PanelBrowserBindingRegistrationStartResult> {
      let started: Awaited<ReturnType<PersistentSelfServeRuntime["beginRegistration"]>>;
      try { started = await runtime.beginRegistration(structuredClone(registration)); }
      catch {
        auditSafely(audit, { stage: "registration", outcome: "unavailable" });
        return invalid();
      }
      if (!started.ok || started.state !== "awaiting_identity") {
        auditSafely(audit, { stage: "registration", outcome: "rejected" });
        return invalid();
      }

      let provider: { url: string; state: string };
      let bootstrapExpiresAt: Date;
      let bindingId: string;
      let candidate: ReturnType<PanelBrowserBindingAuthorityCodec["generateBootstrapCredential"]>;
      const issuedAt = now(clock);
      try {
        provider = exactProviderAuthority(started.authorizationUrl, panelCallbackAuthority);
        const stateDigest = digestState(provider.state);
        if (typeof stateDigest !== "string" || !DIGEST.test(stateDigest)) invalid();
        const providerExpiry = timestamp(started.expiresAt);
        const expiry = Math.min(providerExpiry, issuedAt.getTime() + MAXIMUM_BOOTSTRAP_MS);
        if (expiry <= issuedAt.getTime()) invalid();
        bootstrapExpiresAt = new Date(expiry);
        bindingId = randomUuid();
        if (typeof bindingId !== "string" || !UUID.test(bindingId)) invalid();
        candidate = generateBootstrapCredential();
      } catch {
        auditSafely(audit, { stage: "provider_authority", outcome: "rejected" });
        return invalid();
      }

      let persisted: PanelBrowserBootstrapResult;
      try {
        persisted = await createBootstrap({
          rawState: provider.state,
          bootstrapCredential: candidate.credential,
          providerAuthorizationUrl: provider.url,
          bindingId,
          issuedAt,
          expiresAt: bootstrapExpiresAt,
        });
      } catch {
        auditSafely(audit, { stage: "bootstrap", outcome: "unavailable" });
        return invalid();
      }
      if (persisted.kind !== "browser_bootstrap_created" && persisted.kind !== "browser_bootstrap_replayed") {
        auditSafely(audit, { stage: "bootstrap", outcome: "unavailable" });
        return invalid();
      }
      if (persisted.expiresAt !== bootstrapExpiresAt.toISOString()) {
        auditSafely(audit, { stage: "bootstrap", outcome: "rejected" });
        return invalid();
      }
      auditSafely(audit, { stage: "bootstrap", outcome: "completed" });
      return Object.freeze({
        bootstrapCredential: candidate.credential,
        providerAuthorizationUrl: provider.url,
        panelBootstrapAuthority,
        bootstrapExpiresAt: persisted.expiresAt,
      });
    },
  });
}
