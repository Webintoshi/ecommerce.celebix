import type { StarterSocialNetwork } from "@celebix/saas-contracts";

export function FooterSocialIcon({ network }: Readonly<{ network: StarterSocialNetwork }>) {
  if (network === "instagram") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".9" fill="currentColor" stroke="none" /></svg>;
  if (network === "facebook") return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.9 22v-9h3l.5-3.5h-3.5V7.3c0-1 .3-1.7 1.8-1.7h1.8V2.4c-.3 0-1.4-.2-2.6-.2-2.6 0-4.4 1.6-4.4 4.6v2.7h-3V13h3v9Z" /></svg>;
  if (network === "youtube") return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 6.3a2.7 2.7 0 0 0-1.9-1.9C18 4 12 4 12 4s-6 0-7.7.4a2.7 2.7 0 0 0-1.9 1.9A28 28 0 0 0 2 12c0 2 .1 4 .4 5.7a2.7 2.7 0 0 0 1.9 1.9C6 20 12 20 12 20s6 0 7.7-.4a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12c0-2-.1-4-.4-5.7ZM10 15.5v-7l6 3.5Z" /></svg>;
  if (network === "x") return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 2H21l-7 8 8.2 12h-6.4l-5-7.3L4.4 22H1.2l8.2-9.4L1.5 2H8l4.6 6.7Zm-1.1 18h1.8L7 3.9H5.1Z" /></svg>;
  if (network === "pinterest") return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.7 19.3c0-.9 0-2.1.3-3.1l1.3-5.6a4 4 0 0 1-.3-1.6c0-1.5.9-2.6 2-2.6.9 0 1.3.7 1.3 1.5 0 .9-.6 2.3-.9 3.6-.3 1.1.6 2 1.7 2 2 0 3.4-2.6 3.4-5.6 0-2.3-1.6-4-4.4-4-3.2 0-5.1 2.4-5.1 5 0 .9.3 1.6.8 2.1.2.2.2.3.2.6l-.3 1c0 .3-.3.4-.6.3-1.6-.7-2.3-2.5-2.3-4.5 0-3.3 2.8-7.2 8.1-7.2 4.3 0 7.2 3.1 7.2 6.5 0 4.4-2.5 7.7-6.1 7.7-1.2 0-2.4-.7-2.8-1.5l-.8 3.2c-.3 1.1-.9 2.3-1.4 3.1L12 22a10 10 0 0 0 0-20Z" /></svg>;
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 2c.3 2.5 1.6 4 4 4.2v3.4a9 9 0 0 1-4-1.2v7.4A6.2 6.2 0 1 1 11 9.7v3.5a2.8 2.8 0 1 0 2 2.7V2Z" /></svg>;
}
