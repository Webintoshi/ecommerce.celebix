"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface PanelTopbarChromeState {
  readonly title: string;
  readonly subtitle?: string;
  readonly hideHeading?: boolean;
  readonly actions?: ReactNode;
  readonly context?: ReactNode;
}

type PanelTopbarChromeSnapshot = Pick<PanelTopbarChromeState, "title" | "subtitle" | "hideHeading">;
type Setter = (state: PanelTopbarChromeSnapshot | null) => void;
type Registration = Readonly<{
  publish: (state: PanelTopbarChromeSnapshot) => void;
  release: () => void;
}>;
type RegisterOwner = () => Registration;

type PanelTopbarTargets = Readonly<{
  "panel-topbar-actions": HTMLElement | null;
  "panel-topbar-context": HTMLElement | null;
}>;

const Context = createContext<Readonly<{
  registerOwner: RegisterOwner;
  scopeKey?: string;
  targets?: PanelTopbarTargets;
}> | null>(null);

export function PanelTopbarChromeProvider(
  { children, onChange, targets, scopeKey }: { children: ReactNode; onChange: Setter; targets?: PanelTopbarTargets; scopeKey?: string },
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

  const value = useMemo(() => ({ registerOwner, targets, scopeKey }), [registerOwner, targets, scopeKey]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePanelTopbarChrome(state: PanelTopbarChromeState) {
  const context = useContext(Context);
  const registerOwner = context?.registerOwner;
  const registrationRef = useRef<Registration | null>(null);

  useLayoutEffect(() => {
    const registration = registerOwner?.();
    if (!registration) return;

    registrationRef.current = registration;
    return () => {
      registration.release();
      if (registrationRef.current === registration) registrationRef.current = null;
    };
  }, [registerOwner]);

  useLayoutEffect(() => {
    registrationRef.current?.publish({ title: state.title, subtitle: state.subtitle, hideHeading: state.hideHeading });
  }, [registerOwner, context?.scopeKey, state.hideHeading, state.subtitle, state.title]);
}


export function PanelTopbarBridge(state: PanelTopbarChromeState) {
  usePanelTopbarChrome(state);
  const targets = useContext(Context)?.targets;
  const actionsTarget = targets?.["panel-topbar-actions"];
  const contextTarget = targets?.["panel-topbar-context"];
  return (
    <>
      {contextTarget && state.context ? createPortal(state.context, contextTarget) : null}
      {actionsTarget && state.actions ? createPortal(state.actions, actionsTarget) : null}
    </>
  );
}
