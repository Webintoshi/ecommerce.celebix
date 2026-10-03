import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
  bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
  home: <><path d="m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z" /></>,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  pin: <><path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  truck: <><path d="M3 5h11v12H3V5Zm11 5h4l3 4v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
};
export function LilyumIcon({ name, filled = false }: { name: keyof typeof paths; filled?: boolean }) {
  return <svg className="lf-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
