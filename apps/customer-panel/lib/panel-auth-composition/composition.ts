import {
  DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE,
  assertSaaSAuthAuthorityProfile,
  type SaaSAuthAuthorityProfile,
} from "../../../../packages/platform-config/src/saas.ts";
import { createPanelBrowserBindingCredentialGenerator } from "../panel-browser-binding/credential-codec.ts";
import { createPanelBrowserBindingBootstrapApproval } from "../panel-browser-binding-bootstrap/activation.ts";
import { createPanelBrowserBindingBootstrapHandler } from "../panel-browser-binding-bootstrap/handler.ts";
import { createAuthenticatedPanelBrowserBindingTransport } from "../panel-browser-binding-bootstrap/transport.ts";
import { createPanelSessionCompletionApproval } from "../panel-session-completion/activation.ts";
import { createPanelSessionCompletionHandler } from "../panel-session-completion/completion.ts";
import { createAuthenticatedPanelSessionCompletionTransport } from "../panel-session-completion/transport.ts";
import {
  assertCustomerPanelAuthCompositionApproval,
  type CustomerPanelAuthCompositionApproval,
} from "./activation.ts";

const compositions = new WeakSet<object>();

type Environment = CustomerPanelAuthCompositionApproval["environment"];
type BrowserTransportAudit = Parameters<typeof createAuthenticatedPanelBrowserBindingTransport>[0]["audit"];
type BrowserHandlerAudit = Parameters<typeof createPanelBrowserBindingBootstrapHandler>[0]["audit"];
type SessionTransportAudit = Parameters<typeof createAuthenticatedPanelSessionCompletionTransport>[0]["audit"];
type SessionHandlerAudit = Parameters<typeof createPanelSessionCompletionHandler>[0]["audit"];

export type CustomerPanelAuthReadiness = Readonly<{
  schemaVersion: 1;
  phase: "2B2B2B";
  productionActivation: "forbidden";
  requiredNextGate: "route_mount_and_staging_e2e";
  endpoints: Readonly<{
    browserBootstrap: Readonly<{ method: "POST"; path: "/auth/bootstrap"; state: "disabled_unmounted" }>;
    browserCallback: Readonly<{ method: "GET"; path: "/auth/callback"; state: "disabled_unmounted" }>;
  }>;
}>;

export type DisabledCustomerPanelAuthComposition = Readonly<{
  browserBootstrapHandler: ReturnType<typeof createPanelBrowserBindingBootstrapHandler>;
  panelSessionCompletionHandler: ReturnType<typeof createPanelSessionCompletionHandler>;
  readiness: CustomerPanelAuthReadiness;
}>;

function invalid(): never {
  throw new Error("customer_panel_auth_composition_invalid");
}

function copySecret(value: Uint8Array): Uint8Array {
  if (!(value instanceof Uint8Array)) invalid();
  return new Uint8Array(value);
}

function readiness(): CustomerPanelAuthReadiness {
  const endpoints = Object.freeze({
    browserBootstrap: Object.freeze({
      method: "POST" as const,
      path: "/auth/bootstrap" as const,
      state: "disabled_unmounted" as const,
    }),
    browserCallback: Object.freeze({
      method: "GET" as const,
      path: "/auth/callback" as const,
      state: "disabled_unmounted" as const,
    }),
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    phase: "2B2B2B" as const,
    productionActivation: "forbidden" as const,
    requiredNextGate: "route_mount_and_staging_e2e" as const,
    endpoints,
  });
}

export function assertDisabledCustomerPanelAuthComposition(
  value: unknown,
): asserts value is DisabledCustomerPanelAuthComposition {
  if (!value || typeof value !== "object" || !compositions.has(value) ||
      !Object.isFrozen(value) || !Object.isSealed(value)) invalid();
}

export function createDisabledCustomerPanelAuthComposition(options: {
  activationApproval: unknown;
  authorityProfile?: SaaSAuthAuthorityProfile;
  ownerInternalOrigin: string;
  randomBytes(size: number): Uint8Array;
  clock(): Date;
  fetch(request: Request): Promise<Response>;
  browserBinding: {
    activeKeyId: string;
    activeSecret: Uint8Array;
    maximumBodyBytes: number;
    deadlineMs: number;
    maximumResponseBytes: number;
    transportAudit: BrowserTransportAudit;
    handlerAudit: BrowserHandlerAudit;
  };
  sessionCompletion: {
    activeKeyId: string;
    activeSecret: Uint8Array;
    maximumQueryBytes: number;
    deadlineMs: number;
    maximumResponseBytes: number;
    transportAudit: SessionTransportAudit;
    handlerAudit: SessionHandlerAudit;
  };
  handoffRedeemer: {
    redeemHandoff(input: { credential: string }): Promise<unknown>;
    recoverRedemption(input: { credential: string }): Promise<unknown>;
  };
}): DisabledCustomerPanelAuthComposition {
  assertCustomerPanelAuthCompositionApproval(options?.activationApproval);
  if (
    typeof options.randomBytes !== "function" || typeof options.clock !== "function" ||
    typeof options.fetch !== "function" || !options.handoffRedeemer ||
    typeof options.handoffRedeemer.redeemHandoff !== "function" ||
    typeof options.handoffRedeemer.recoverRedemption !== "function"
  ) invalid();
  const environment: Environment = options.activationApproval.environment;
  const authority = options.authorityProfile ?? DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE;
  try { assertSaaSAuthAuthorityProfile(authority); } catch { return invalid(); }
  if (options.ownerInternalOrigin !== authority.ownerOrigin) invalid();
  const randomBytes = options.randomBytes;
  const clock = options.clock;
  const fetch = options.fetch;
  const browserSecret = copySecret(options.browserBinding.activeSecret);
  const sessionSecret = copySecret(options.sessionCompletion.activeSecret);
  const handoffRedeemer = Object.freeze({
    redeemHandoff: options.handoffRedeemer.redeemHandoff.bind(options.handoffRedeemer),
    recoverRedemption: options.handoffRedeemer.recoverRedemption.bind(options.handoffRedeemer),
  });

  const browserApproval = createPanelBrowserBindingBootstrapApproval(environment);
  const browserTransport = createAuthenticatedPanelBrowserBindingTransport({
    activationApproval: browserApproval,
    ownerInternalOrigin: options.ownerInternalOrigin,
    panelCallbackAuthority: authority.panelCallbackUrl,
    activeKeyId: options.browserBinding.activeKeyId,
    activeSecret: browserSecret,
    fetch,
    clock,
    deadlineMs: options.browserBinding.deadlineMs,
    maximumResponseBytes: options.browserBinding.maximumResponseBytes,
    audit: options.browserBinding.transportAudit,
  });
  const browserBootstrapHandler = createPanelBrowserBindingBootstrapHandler({
    activationApproval: browserApproval,
    publicBootstrapAuthority: authority.panelBootstrapUrl,
    maximumBodyBytes: options.browserBinding.maximumBodyBytes,
    credentialGenerator: createPanelBrowserBindingCredentialGenerator(randomBytes),
    transport: browserTransport,
    clock,
    audit: options.browserBinding.handlerAudit,
  });

  const sessionApproval = createPanelSessionCompletionApproval(environment);
  const sessionTransport = createAuthenticatedPanelSessionCompletionTransport({
    activationApproval: sessionApproval,
    ownerInternalOrigin: options.ownerInternalOrigin,
    panelCallbackAuthority: authority.panelCallbackUrl,
    activeKeyId: options.sessionCompletion.activeKeyId,
    activeSecret: sessionSecret,
    fetch,
    clock,
    deadlineMs: options.sessionCompletion.deadlineMs,
    maximumResponseBytes: options.sessionCompletion.maximumResponseBytes,
    audit: options.sessionCompletion.transportAudit,
  });
  const panelSessionCompletionHandler = createPanelSessionCompletionHandler({
    activationApproval: sessionApproval,
    publicCallbackAuthority: authority.panelCallbackUrl,
    panelHomeAuthority: authority.panelHomeUrl,
    maximumQueryBytes: options.sessionCompletion.maximumQueryBytes,
    transport: sessionTransport,
    redeemer: handoffRedeemer,
    clock,
    audit: options.sessionCompletion.handlerAudit,
  });

  const composition: DisabledCustomerPanelAuthComposition = {
    browserBootstrapHandler,
    panelSessionCompletionHandler,
    readiness: readiness(),
  };
  compositions.add(composition);
  return Object.freeze(composition);
}
