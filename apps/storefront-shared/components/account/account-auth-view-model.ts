export function maskAccountEmail(value: string): string {
  const email = value.trim().toLocaleLowerCase("tr-TR");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return "***";
  const separator = email.indexOf("@");
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}
