import type { ContactWidgetConfig } from "@celebix/saas-contracts";

type ChannelType = ContactWidgetConfig["channels"][number]["type"];

export function ContactChannelIcon({ type }: Readonly<{ type: ChannelType }>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type === "whatsapp" ? <><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.8a8.5 8.5 0 1 1 16.2-4Z" /><path d="m8 7 2 3-1.3 1.3a9 9 0 0 0 4 4L14 14l3 2c-.5 1.5-1.5 2-3 1.5-3.5-1-6.5-4-7.5-7.5C6 8.5 6.5 7.5 8 7Z" /></> : null}
    {type === "phone" ? <path d="m8 3 3 5-3 3a15 15 0 0 0 5 5l3-3 5 3c0 3-2 5-5 5C9 20 4 15 3 8c0-3 2-5 5-5Z" /> : null}
    {type === "sms" ? <><path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-10A8.5 8.5 0 1 1 20 11.5Z" /><path d="M7 10h9M7 14h5" /></> : null}
    {type === "email" ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></> : null}
    {type === "instagram" ? <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" fill="currentColor" stroke="none" /></> : null}
    {type === "telegram" ? <><path d="m3 10 18-7-4 18-6-6-4 3v-6L3 10Z" /><path d="m7 12 10-5-6 8" /></> : null}
    {type === "messenger" ? <><path d="M21 11.5a9 9 0 0 1-9 8.5 10 10 0 0 1-3-.5L4 21v-5a8 8 0 0 1-1-4.5 9 9 0 0 1 18 0Z" /><path d="m7 14 4-5 3 3 3-2-4 5-3-3-3 2Z" /></> : null}
    {type === "maps" ? <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></> : null}
    {type === "contact_page" ? <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="2" /><path d="M5 16v-1a3 3 0 0 1 6 0v1M14 9h4M14 13h4" /></> : null}
  </svg>;
}
