"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface PanelTopbarChromeState {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
}

type Setter = (state: PanelTopbarChromeState | null) => void;
const Context = createContext<Setter | null>(null);

export function PanelTopbarChromeProvider(
  { children, onChange }: { children: ReactNode; onChange: Setter },
) {
  return <Context.Provider value={onChange}>{children}</Context.Provider>;
}

export function usePanelTopbarChrome(state: PanelTopbarChromeState) {
  const setState = useContext(Context);
  useEffect(() => {
    setState?.({ title: state.title, subtitle: state.subtitle });
    return () => setState?.(null);
  }, [setState, state.subtitle, state.title]);
}

function useTopbarActionsTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let frame = window.requestAnimationFrame(() => {
      setTarget(document.getElementById("panel-topbar-actions"));
    });
    const observer = new MutationObserver(() => {
      setTarget(document.getElementById("panel-topbar-actions"));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return target;
}

export function PanelTopbarBridge(state: PanelTopbarChromeState) {
  usePanelTopbarChrome(state);
  const target = useTopbarActionsTarget();
  return target && state.actions ? createPortal(state.actions, target) : null;
}
