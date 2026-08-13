import type {
  MerchantPaymentMethod,
  MerchantProviderProfile,
  PaymentMethodMutationResult,
  PaymentProviderEnvironment,
} from "@celebix/saas-contracts";
import {
  defaultProviderPaymentMethodConfig,
  parseProviderPaymentMethodConfig,
  type ExecutableHostedPaymentProvider,
} from "@celebix/saas-contracts";

import type {
  PaymentMethodOrderCommand,
  SavePaymentMethodCommand,
  SetPaymentMethodStateCommand,
} from "../payment-method-ui/client.ts";
import { PaymentMethodApiError } from "../payment-method-ui/client.ts";
import type { PaymentProviderCatalogCard } from "./model.ts";

export type PaymentSettingsSourceSlice<T> = Readonly<{
  phase: "loading" | "ready" | "error";
  value: readonly T[];
}>;

export type PaymentSettingsSources<C, D, P, M> = Readonly<{
  catalog: PaymentSettingsSourceSlice<C>;
  definitions: PaymentSettingsSourceSlice<D>;
  profiles: PaymentSettingsSourceSlice<P>;
  methods: PaymentSettingsSourceSlice<M>;
}>;

type ProviderPaymentMethodApi = Readonly<{
  list(): Promise<readonly MerchantPaymentMethod[]>;
  save(input: SavePaymentMethodCommand): Promise<PaymentMethodMutationResult>;
  setState(methodId: string, input: SetPaymentMethodStateCommand): Promise<PaymentMethodMutationResult>;
}>;

export type ProviderPaymentMethodActivationResult = Readonly<{
  kind: "active" | "awaiting_authority" | "emergency_disabled";
  methodId: string | null;
  created: boolean;
}>;

function activationEnvironment(
  card: PaymentProviderCatalogCard,
  profile: MerchantProviderProfile,
): PaymentProviderEnvironment | null {
  const descriptor = card.executableDescriptor;
  const authority = descriptor?.executionAuthority;
  const environment = profile.publicConfig.environment;
  return card.executable
    && descriptor !== null
    && authority !== null
    && authority !== undefined
    && profile.status === "active"
    && profile.providerCode === card.providerCode
    && profile.capability === "payment_processing"
    && (environment === "test" || environment === "live")
    && descriptor.providerCode === card.providerCode
    && descriptor.capability === "payment_processing"
    && descriptor.environments?.includes(environment) === true
    && authority.environment === environment
    && descriptor.adapterVersion === authority.adapterVersion
    && /^sha256:[a-f0-9]{64}$/.test(authority.evidenceDigest)
    ? environment
    : null;
}

function activationResult(
  kind: ProviderPaymentMethodActivationResult["kind"],
  methodId: string | null,
  created: boolean,
): ProviderPaymentMethodActivationResult {
  return Object.freeze({ kind, methodId, created });
}

function providerBindings(
  methods: readonly MerchantPaymentMethod[],
  providerCode: string,
  profileId: string,
): readonly MerchantPaymentMethod[] {
  return Object.freeze(methods.filter((method) =>
    method.kind === "provider"
    && method.providerCode === providerCode
    && method.profileId === profileId)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function exactEnvironmentMethods(
  methods: readonly MerchantPaymentMethod[],
  providerCode: string,
  profileId: string,
  environment: PaymentProviderEnvironment,
): readonly MerchantPaymentMethod[] {
  return Object.freeze(providerBindings(methods, providerCode, profileId).filter((method) => {
    try {
      return parseProviderPaymentMethodConfig(
        providerCode as ExecutableHostedPaymentProvider,
        method.config,
      ).environment === environment;
    } catch {
      return false;
    }
  }));
}

function inspectExistingMethod(
  methods: readonly MerchantPaymentMethod[],
  providerCode: string,
  profileId: string,
  environment: PaymentProviderEnvironment,
  created: boolean,
): ProviderPaymentMethodActivationResult | MerchantPaymentMethod | null {
  const exact = exactEnvironmentMethods(methods, providerCode, profileId, environment);
  const emergency = exact.find(({ state }) => state === "emergency_disabled");
  if (emergency) return activationResult("emergency_disabled", emergency.id, created);
  const active = exact.find(({ state }) => state === "active");
  if (active) return activationResult("active", active.id, created);
  return exact.find(({ state }) => state === "disabled") ?? null;
}

function recoverableActivationError(error: unknown): error is PaymentMethodApiError {
  return error instanceof PaymentMethodApiError
    && (error.code === "version_conflict" || error.code === "unavailable" || error.code === "invalid_transition");
}

async function activateExistingMethod(input: Readonly<{
  method: MerchantPaymentMethod;
  providerCode: string;
  profileId: string;
  environment: PaymentProviderEnvironment;
  created: boolean;
  api: ProviderPaymentMethodApi;
}>): Promise<ProviderPaymentMethodActivationResult> {
  try {
    const activated = await input.api.setState(input.method.id, Object.freeze({
      expectedVersion: input.method.version,
      state: "active" as const,
      emergencyReason: null,
    }));
    return activated.state === "emergency_disabled"
      ? activationResult("emergency_disabled", activated.id, input.created)
      : activated.state === "active"
        ? activationResult("active", activated.id, input.created)
        : activationResult("awaiting_authority", activated.id, input.created);
  } catch (error) {
    if (!recoverableActivationError(error)) throw error;
    let current: readonly MerchantPaymentMethod[];
    try {
      current = await input.api.list();
    } catch {
      throw error;
    }
    const reconciled = inspectExistingMethod(
      current,
      input.providerCode,
      input.profileId,
      input.environment,
      input.created,
    );
    return reconciled && "created" in reconciled
      ? reconciled
      : activationResult("awaiting_authority", reconciled?.id ?? input.method.id, input.created);
  }
}

export async function activateProviderPaymentMethod(input: Readonly<{
  card: PaymentProviderCatalogCard;
  profile: MerchantProviderProfile;
  methods: readonly MerchantPaymentMethod[];
  api: ProviderPaymentMethodApi;
}>): Promise<ProviderPaymentMethodActivationResult> {
  const environment = activationEnvironment(input.card, input.profile);
  if (environment === null) {
    return activationResult("awaiting_authority", null, false);
  }
  const existing = inspectExistingMethod(
    input.methods,
    input.card.providerCode,
    input.profile.id,
    environment,
    false,
  );
  if (existing && "created" in existing) return existing;
  if (existing) return activateExistingMethod({
    method: existing,
    providerCode: input.card.providerCode,
    profileId: input.profile.id,
    environment,
    created: false,
    api: input.api,
  });
  if (providerBindings(input.methods, input.card.providerCode, input.profile.id).length > 0) {
    return activationResult("awaiting_authority", null, false);
  }
  let config;
  try {
    config = defaultProviderPaymentMethodConfig(
      input.card.providerCode as ExecutableHostedPaymentProvider,
      environment,
    );
  } catch {
    return activationResult("awaiting_authority", null, false);
  }

  let saved: PaymentMethodMutationResult;
  try {
    saved = await input.api.save(Object.freeze({
      methodId: input.profile.id,
      expectedVersion: 0,
      kind: "provider" as const,
      profileId: input.profile.id,
      providerCode: input.card.providerCode,
      label: input.card.executableDescriptor!.label,
      config,
    }));
  } catch (error) {
    if (!recoverableActivationError(error)) throw error;
    let current: readonly MerchantPaymentMethod[];
    try {
      current = await input.api.list();
    } catch {
      throw error;
    }
    const reconciled = inspectExistingMethod(
      current,
      input.card.providerCode,
      input.profile.id,
      environment,
      false,
    );
    if (reconciled && "created" in reconciled) return reconciled;
    if (reconciled) return activateExistingMethod({
      method: reconciled,
      providerCode: input.card.providerCode,
      profileId: input.profile.id,
      environment,
      created: false,
      api: input.api,
    });
    throw error;
  }
  if (saved.id !== input.profile.id) throw new PaymentMethodApiError("unavailable", 503);
  if (saved.state === "active") return activationResult("active", saved.id, true);
  if (saved.state === "emergency_disabled") return activationResult("emergency_disabled", saved.id, true);
  return activateExistingMethod({
    method: Object.freeze({
      id: saved.id,
      kind: "provider",
      profileId: input.profile.id,
      providerCode: input.card.providerCode,
      label: input.card.executableDescriptor!.label,
      state: saved.state,
      emergencyReason: null,
      position: saved.position,
      config,
      version: saved.version,
      createdAt: saved.updatedAt,
      updatedAt: saved.updatedAt,
    }),
    providerCode: input.card.providerCode,
    profileId: input.profile.id,
    environment,
    created: true,
    api: input.api,
  });
}

function slice<T>(result: PromiseSettledResult<readonly T[]>): PaymentSettingsSourceSlice<T> {
  return result.status === "fulfilled"
    ? Object.freeze({ phase: "ready", value: Object.freeze([...result.value]) })
    : Object.freeze({ phase: "error", value: Object.freeze([]) });
}

export function createLoadingPaymentSettingsSources<C, D, P, M>(): PaymentSettingsSources<C, D, P, M> {
  const loading = <T>(): PaymentSettingsSourceSlice<T> => Object.freeze({ phase: "loading", value: Object.freeze([]) });
  return Object.freeze({
    catalog: loading<C>(),
    definitions: loading<D>(),
    profiles: loading<P>(),
    methods: loading<M>(),
  });
}

export async function loadPaymentSettingsSources<C, D, P, M>(loaders: Readonly<{
  catalog(): Promise<readonly C[]>;
  definitions(): Promise<readonly D[]>;
  profiles(): Promise<readonly P[]>;
  methods(): Promise<readonly M[]>;
  shouldLoadProviderExecution?(catalog: readonly C[]): boolean;
}>): Promise<PaymentSettingsSources<C, D, P, M>> {
  if (loaders.shouldLoadProviderExecution === undefined) {
    const [catalog, definitions, profiles, methods] = await Promise.allSettled([
      loaders.catalog(),
      loaders.definitions(),
      loaders.profiles(),
      loaders.methods(),
    ]);
    return Object.freeze({
      catalog: slice(catalog),
      definitions: slice(definitions),
      profiles: slice(profiles),
      methods: slice(methods),
    });
  }

  const [catalog, methods] = await Promise.allSettled([loaders.catalog(), loaders.methods()]);
  const loadProviderExecution = catalog.status === "fulfilled"
    && loaders.shouldLoadProviderExecution(catalog.value);
  const [definitions, profiles] = await Promise.allSettled(loadProviderExecution
    ? [loaders.definitions(), loaders.profiles()] as const
    : [Promise.resolve(Object.freeze([]) as readonly D[]), Promise.resolve(Object.freeze([]) as readonly P[])] as const);
  return Object.freeze({
    catalog: slice(catalog),
    definitions: slice(definitions),
    profiles: slice(profiles),
    methods: slice(methods),
  });
}

export function movePaymentMethodOrder(
  order: readonly string[],
  methodId: string,
  direction: "up" | "down",
): readonly string[] {
  const index = order.indexOf(methodId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= order.length) return Object.freeze([...order]);
  const selected = [...order];
  [selected[index], selected[target]] = [selected[target]!, selected[index]!];
  return Object.freeze(selected);
}

export function hasPaymentMethodOrderChanged(
  original: readonly string[],
  selected: readonly string[],
): boolean {
  return original.length !== selected.length || original.some((id, index) => selected[index] !== id);
}

export function buildPaymentMethodOrderCommands(
  methods: readonly MerchantPaymentMethod[],
  order: readonly string[],
): readonly PaymentMethodOrderCommand[] {
  if (
    methods.length < 1
    || methods.length !== order.length
    || new Set(order).size !== order.length
    || new Set(methods.map(({ id }) => id)).size !== methods.length
  ) throw new TypeError("payment_method_order_invalid");
  const byId = new Map(methods.map((item) => [item.id, item] as const));
  const commands = order.map((id, position) => {
    const selected = byId.get(id);
    if (!selected) throw new TypeError("payment_method_order_invalid");
    return Object.freeze({ id, expectedVersion: selected.version, position });
  });
  return Object.freeze(commands);
}
