import { useEffect, useState } from "react";

export function useAnimatedCounter(value: number, duration = 500): number {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let start: number | undefined;

    function animate(time: number) {
      start ??= time;
      const progress = Math.min((time - start) / duration, 1);
      setDisplayValue(progress === 1 ? value : Math.round(value * progress));
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    }

    function applyMotionPreference() {
      if (reducedMotion.matches) {
        window.cancelAnimationFrame(frame);
        setDisplayValue(value);
      }
    }

    if (reducedMotion.matches) applyMotionPreference();
    else frame = window.requestAnimationFrame(animate);
    reducedMotion.addEventListener("change", applyMotionPreference);

    return () => {
      reducedMotion.removeEventListener("change", applyMotionPreference);
      window.cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return displayValue;
}
