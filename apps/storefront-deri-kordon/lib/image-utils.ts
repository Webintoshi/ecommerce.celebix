export function shouldBypassImageOptimization(src?: string | null) {
  if (!src) {
    return false;
  }

  const normalized = src.trim().toLowerCase();
  const withoutQuery = normalized.split("?")[0].split("#")[0];

  return (
    normalized.startsWith("data:") ||
    normalized.startsWith("blob:") ||
    withoutQuery.endsWith(".svg")
  );
}
