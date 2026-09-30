"use client";

import { useEffect, useState } from "react";

export function GuzideRailControls({ rowId, label }: Readonly<{ rowId: string; label: string }>) {
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const rail = document.getElementById(rowId)?.querySelector<HTMLElement>(".product-grid");
    if (!rail) return;
    const sync = () => {
      const start = rail.scrollLeft <= 2;
      const end = rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 2;
      setEdges((previous) => previous.start === start && previous.end === end ? previous : { start, end });
    };
    const resize = new ResizeObserver(sync);
    resize.observe(rail);
    rail.addEventListener("scroll", sync, { passive: true });
    sync();
    return () => { resize.disconnect(); rail.removeEventListener("scroll", sync); };
  }, [rowId]);

  function scroll(direction: number) {
    const rail = document.getElementById(rowId)?.querySelector<HTMLElement>(".product-grid");
    if (!rail) return;
    rail.scrollBy({
      left: direction * (rail.clientWidth + 24),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return <div className="guzide-rail-controls">
    <button type="button" aria-label={`${label}, önceki ürünler`} disabled={edges.start} onClick={() => scroll(-1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6" /></svg>
    </button>
    <button type="button" aria-label={`${label}, sonraki ürünler`} disabled={edges.end} onClick={() => scroll(1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
    </button>
  </div>;
}
