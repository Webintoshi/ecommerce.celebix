const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

type CanonicalStorefrontLocationInput = Readonly<{
  requestedHostname: string;
  primaryHostname: string;
  pathname: string;
  search: string;
}>;

function invalid(): never {
  throw new TypeError("storefront_canonicalization_invalid");
}

function hostname(value: string): string {
  if (typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim() || value !== value.toLowerCase() || !HOSTNAME.test(value)) invalid();
  return value;
}

function path(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 4_096 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("#") || CONTROL.test(value)) invalid();
  return value;
}

function query(value: string): string {
  if (typeof value !== "string" || value.length > 2_048 || (value !== "" && !value.startsWith("?")) || value.includes("#") || CONTROL.test(value)) invalid();
  return value;
}

export function createCanonicalStorefrontLocation(input: CanonicalStorefrontLocationInput): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const requestedHostname = hostname(input.requestedHostname);
  const primaryHostname = hostname(input.primaryHostname);
  const pathname = path(input.pathname);
  const search = query(input.search);
  if (requestedHostname === primaryHostname) return null;
  return `https://${primaryHostname}${pathname}${search}`;
}
