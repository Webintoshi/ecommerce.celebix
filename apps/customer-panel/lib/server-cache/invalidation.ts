import { resolveDefaultCacheRuntime, type Cache, type CacheDataClass } from "@celebix/saas-cache";

export type CacheInvalidationRules<T extends object> = Partial<Readonly<Record<Extract<keyof T, string>, readonly CacheDataClass[]>>>;

function storeIdFromArguments(args: readonly unknown[]): string | null {
  const input = args[0];
  if (typeof input !== "object" || input === null) return null;
  const tenantContext = (input as Record<string, unknown>).tenantContext;
  if (typeof tenantContext !== "object" || tenantContext === null) return null;
  const store = (tenantContext as Record<string, unknown>).store;
  if (typeof store !== "object" || store === null) return null;
  const id = (store as Record<string, unknown>).id;
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

export function createPostCommitInvalidatingRepository<T extends object>(
  repository: T,
  rules: CacheInvalidationRules<T>,
  cache: Cache | null = resolveDefaultCacheRuntime().cache,
  observe: (event: `invalidation:${CacheDataClass}`) => void = () => undefined,
): T {
  if (cache === null) return repository;
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      const dataClasses = typeof property === "string" ? rules[property as Extract<keyof T, string>] : undefined;
      if (typeof value !== "function" || dataClasses === undefined) return value;
      return async (...args: unknown[]) => {
        const result = await Reflect.apply(value, target, args) as unknown;
        const storeId = storeIdFromArguments(args);
        if (storeId !== null) {
          for (const dataClass of dataClasses) {
            await cache.rotateNamespace(storeId, dataClass).catch(() => undefined);
            observe(`invalidation:${dataClass}`);
          }
        }
        return result;
      };
    },
  });
}

export function catalogInvalidationRules<T extends object>(rules: CacheInvalidationRules<T>): CacheInvalidationRules<T> {
  return Object.freeze(rules);
}
