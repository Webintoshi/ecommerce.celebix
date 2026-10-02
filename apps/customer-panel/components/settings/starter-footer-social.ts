import type { StarterSocialNetwork } from "@celebix/saas-contracts";

export const STARTER_SOCIAL_NETWORK_OPTIONS = Object.freeze([
  { value: "instagram", label: "Instagram" }, { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" }, { value: "pinterest", label: "Pinterest" },
  { value: "tiktok", label: "TikTok" }, { value: "x", label: "X" },
] as const);

const SOCIAL_HOSTS: Readonly<Record<StarterSocialNetwork, readonly string[]>> = Object.freeze({
  instagram: ["instagram.com", "www.instagram.com"], facebook: ["facebook.com", "www.facebook.com"], youtube: ["youtube.com", "www.youtube.com"],
  pinterest: ["pinterest.com", "www.pinterest.com"], tiktok: ["tiktok.com", "www.tiktok.com"], x: ["x.com", "www.x.com"],
});
const ACCOUNT = /^[\p{L}\p{N}._-]+$/u;

export function reviewedSocialUrl(network: StarterSocialNetwork, value: string): string | null {
  if (value !== value.trim() || value.length > 512) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash && url.pathname !== "/" && url.toString() === value && SOCIAL_HOSTS[network].includes(url.hostname) ? value : null;
  } catch { return null; }
}

export function socialProfileUrl(network: StarterSocialNetwork, value: string): string | null {
  const account = value.trim().replace(/^@/, "");
  if (!ACCOUNT.test(account)) return null;
  const prefix = network === "youtube" || network === "tiktok" ? "@" : "";
  return reviewedSocialUrl(network, `https://${SOCIAL_HOSTS[network][1]}/${prefix}${encodeURIComponent(account)}`);
}

/** Derive a display label without rewriting the saved profile address. */
export function socialProfileAccount(network: StarterSocialNetwork, value: string): string {
  if (!reviewedSocialUrl(network, value)) return "Kayıtlı hesap";
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (network === "youtube" && parts[0] === "channel") return "Kayıtlı hesap";
    const nestedAccount = (network === "youtube" && (parts[0] === "c" || parts[0] === "user")) || (network === "facebook" && parts[0] === "pages");
    const account = (parts[nestedAccount ? 1 : 0] ?? "").replace(/^@/, "");
    return ACCOUNT.test(account) ? account : "Kayıtlı hesap";
  } catch { return "Kayıtlı hesap"; }
}
