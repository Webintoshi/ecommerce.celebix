"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface PanelTopbarChromeState {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
  readonly context?: ReactNode;
}

type PanelTopbarChromeSnapshot = Pick<PanelTopbarChromeState, "title" | "subtitle">;
type Setter = (state: PanelTopbarChromeSnapshot | null) => void;
type Registration = Readonly<{
  publish: (state: PanelTopbarChromeSnapshot) => void;
  release: () => void;
}>;
type RegisterOwner = () => Registration;

const Context = createContext<RegisterOwner | null>(null);

export function PanelTopbarChromeProvider(
  { children, onChange }: { children: ReactNode; onChange: Setter },
) {
  const registrationsRef = useRef(new Map<symbol, PanelTopbarChromeSnapshot>());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const registerOwner = useCallback(() => {
    const owner = Symbol("panel-topbar-owner");
    const registrations = registrationsRef.current;
    let released = false;

    function publish(state: PanelTopbarChromeSnapshot) {
      if (released) return;
      registrations.set(owner, state);
      if ([...registrations.keys()].at(-1) === owner) onChangeRef.current(state);
    }

    function release() {
      if (released) return;
      released = true;
      const wasActive = [...registrations.keys()].at(-1) === owner;
      registrations.delete(owner);
      if (wasActive) onChangeRef.current([...registrations.values()].at(-1) ?? null);
    }

    return Object.freeze({ publish, release });
  }, []);

  return <Context.Provider value={registerOwner}>{children}</Context.Provider>;
}

export function usePanelTopbarChrome(state: PanelTopbarChromeState) {
  const registerOwner = useContext(Context);
  const registrationRef = useRef<Registration | null>(null);

  useEffect(() => {
    const registration = registerOwner?.();
    if (!registration) return;

    registrationRef.current = registration;
    return () => {
      registration.release();
      if (registrationRef.current === registration) registrationRef.current = null;
    };
  }, [registerOwner]);

  useEffect(() => {
    registrationRef.current?.publish({ title: state.title, subtitle: state.subtitle });
  }, [registerOwner, state.subtitle, state.title]);
}

type PanelTopbarTargetId = "panel-topbar-actions" | "panel-topbar-context";

function useTopbarTarget(id: PanelTopbarTargetId) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let frame = window.requestAnimationFrame(() => {
      setTarget(document.getElementById(id));
    });
    const observer = new MutationObserver(() => {
      setTarget(document.getElementById(id));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [id]);
  return target;
}

export function PanelTopbarBridge(state: PanelTopbarChromeState) {
  usePanelTopbarChrome(state);
  const actionsTarget = useTopbarTarget("panel-topbar-actions");
  const contextTarget = useTopbarTarget("panel-topbar-context");
  return (
    <>
      {contextTarget && state.context ? createPortal(state.context, contextTarget) : null}
      {actionsTarget && state.actions ? createPortal(state.actions, actionsTarget) : null}
    </>
  );
}
