export type StoreIconName = "search" | "heart" | "account" | "cart";

const PATHS: Readonly<Record<StoreIconName, React.ReactNode>> = Object.freeze({
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  heart: <path d="M20.5 8.7c0 5-8.5 10.3-8.5 10.3S3.5 13.7 3.5 8.7A4.7 4.7 0 0 1 12 5.9a4.7 4.7 0 0 1 8.5 2.8Z" />,
  account: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-4 2.8-6 7-6s6.5 2 7 6" /></>,
  cart: <><path d="M3 4h2l2 11h10l2-7H6" /><circle cx="9" cy="19" r="1" /><circle cx="17" cy="19" r="1" /></>,
});

export function StoreIcon({ name }: Readonly<{ name: StoreIconName }>) {
  return <svg aria-hidden="true" className="store-icon" fill="none" focusable="false" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">{PATHS[name]}</svg>;
}
