// Disposable offline Node harness only: Next's server-only marker has no
// runtime implementation; it guards bundling, which is verified by build.
export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "offline-test:server-only", shortCircuit: true };
  if (specifier === "redis") return { url: "offline-test:redis", shortCircuit: true };
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url === "offline-test:server-only") return { format: "module", source: "export {};", shortCircuit: true };
  if (url === "offline-test:redis") return { format: "module", source: "export function createClient() { throw new Error('offline_test_disallows_redis'); }", shortCircuit: true };
  return nextLoad(url, context);
}
