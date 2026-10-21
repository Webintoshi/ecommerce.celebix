export function formatTry(cents: number | null): string {
  if (cents === null) return "";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(cents / 100);
}
