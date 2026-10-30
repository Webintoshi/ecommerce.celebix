"use client";

import { forwardRef, useEffect, useState, type InputHTMLAttributes } from "react";
import styles from "./animated-input.module.css";

type OrbInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue"> & Readonly<{
  value?: string;
  defaultValue?: string;
  compact?: boolean;
}>;

export const OrbInput = forwardRef<HTMLInputElement, OrbInputProps>(function OrbInput({
  value, defaultValue = "", placeholder = "Bilginizi girin", compact = false,
  onChange, onFocus, onBlur, disabled, className, ...props
}, ref) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const [animatedText, setAnimatedText] = useState<string | null>(null);
  const currentValue = value ?? localValue;

  useEffect(() => {
    if (!focused || currentValue || disabled) { setAnimatedText(null); return; }
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    const stop = () => { window.clearInterval(timer); setAnimatedText(null); };
    const visibility = () => { if (document.hidden) stop(); };
    if (preference.matches || document.hidden) return;
    const chars = Array.from(placeholder);
    let index = 0;
    setAnimatedText("");
    timer = window.setInterval(() => {
      if (document.hidden || preference.matches || index >= chars.length || index >= 32) { stop(); return; }
      index += 1;
      setAnimatedText(chars.slice(0, index).join(""));
    }, 65);
    preference.addEventListener("change", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.clearInterval(timer); preference.removeEventListener("change", stop); document.removeEventListener("visibilitychange", visibility); };
  }, [focused, currentValue, disabled, placeholder]);

  return <span className={styles.shell} data-orb-field data-compact={compact || undefined} data-invalid={props["aria-invalid"] || undefined} data-animating={animatedText !== null || undefined}>
    <input {...props} ref={ref} className={`${styles.input} ${className ?? ""}`} disabled={disabled} value={value} defaultValue={value === undefined ? defaultValue : undefined}
      placeholder={animatedText === null ? placeholder : `${animatedText}│`}
      onChange={event => { if (value === undefined) setLocalValue(event.currentTarget.value); onChange?.(event); }}
      onFocus={event => { if (value === undefined) setLocalValue(event.currentTarget.value); setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
    />
  </span>;
});

export default OrbInput;
