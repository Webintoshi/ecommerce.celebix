import { normalizeStorefrontAccountPhone } from "../../lib/account/phone.ts";

export function maskAccountEmail(value: string): string {
  const email = value.trim().toLocaleLowerCase("tr-TR");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return "***";
  const separator = email.indexOf("@");
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

export function maskAccountPhone(value: string): string {
  let phone: string;
  try { phone = normalizeStorefrontAccountPhone(value); } catch { return "***"; }
  const prefix = phone.startsWith("+90") ? `+90 ${phone[3]}** ***` : "+*** ***";
  return `${prefix} ${phone.slice(-4, -2)} ${phone.slice(-2)}`;
}

export function accountPhoneStartBody(entry: Readonly<{ phone: string; returnTo: string }>) {
  return {
    phone: entry.phone.trim(),
    returnTo: entry.returnTo,
  };
}

export function accountRetryDeadline(seconds: number | undefined, now: number): number {
  return now + (typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) * 1_000 : 0);
}

export function accountRetryRemaining(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}
