export function HizliIcon({ name }: { name: "arrow" | "chevron" | "menu" | "close" | "home" | "grid" | "bag" }) {
  const paths = {
    arrow: <><path d="M4 12h16M14 6l6 6-6 6" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    menu: <><path d="M4 6h16M4 12h16M4 18h11" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    bag: <><path d="m5 7-1 14h16L19 7Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
