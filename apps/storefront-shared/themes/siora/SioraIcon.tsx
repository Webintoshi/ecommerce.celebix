import type { ReactNode } from "react";

export type SioraIconName = "home" | "menu" | "search" | "heart" | "bag" | "account" | "close" | "arrow";

const paths: Readonly<Record<SioraIconName, ReactNode>> = Object.freeze({
  home: <><path d="m3.5 10 8.5-7 8.5 7v10.5h-6v-7h-5v7h-6Z" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  heart: <path d="M20.5 8.7c0 5-8.5 10.3-8.5 10.3S3.5 13.7 3.5 8.7A4.7 4.7 0 0 1 12 5.9a4.7 4.7 0 0 1 8.5 2.8Z" />,
  bag: <><path d="M5 7.5h14l1 13H4Z" /><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" /></>,
  account: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-1.5a7 7 0 0 1 14 0V21" /></>,
  close: <path d="m5 5 14 14M5 19 19 5" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
});

export function SioraIcon({ name }: Readonly<{ name: SioraIconName }>) {
  return <svg className="siora-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
