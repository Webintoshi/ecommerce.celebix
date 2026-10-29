"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { PanelRouteLoading } from "./PanelRouteLoading";
import styles from "./panel-initial-data-gate.module.css";

const PageReadinessContext = createContext(false);

function InitialDataSurface({ pending, children, contentRef }: {
  pending: boolean;
  children: ReactNode;
  contentRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className={styles.gate} data-panel-initial-loading={pending ? "true" : "false"}>
      {pending ? <div className={styles.loading}><PanelRouteLoading /></div> : null}
      <div ref={contentRef} className={styles.content} hidden={pending} inert={pending} aria-hidden={pending || undefined}>
        {children}
      </div>
    </div>
  );
}

export function PanelInitialDataBoundary({ scopeKey, children }: Readonly<{
  scopeKey: string;
  children: ReactNode;
}>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [readiness, setReadiness] = useState(() => ({ scope: scopeKey, ready: false }));
  let ready = readiness.ready;
  if (readiness.scope !== scopeKey) {
    ready = false;
    setReadiness({ scope: scopeKey, ready: false });
  }

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (ready || !content) return;
    let active = true;
    const observer = new MutationObserver(reconcile);
    function reconcile() {
      // Dehydrated page chunks still expose their server-rendered declarations.
      if (!active || content!.querySelector('[data-panel-initial-reader="pending"]')) return;
      active = false;
      observer.disconnect();
      setReadiness(current => current.scope === scopeKey ? { scope: scopeKey, ready: true } : current);
    }
    observer.observe(content, {
      attributes: true,
      attributeFilter: ["data-panel-initial-reader"],
      childList: true,
      subtree: true,
    });
    reconcile();
    return () => { active = false; observer.disconnect(); };
  }, [ready, scopeKey]);

  return <PageReadinessContext.Provider value>
    <InitialDataSurface pending={!ready} contentRef={contentRef}>{children}</InitialDataSurface>
  </PageReadinessContext.Provider>;
}

export function PanelInitialDataGate({ pending, children, scopeKey }: Readonly<{
  pending: boolean;
  children: ReactNode;
  scopeKey?: string;
}>) {
  const boundary = useContext(PageReadinessContext);
  const pathname = usePathname() ?? "";
  const scope = JSON.stringify([pathname, scopeKey]);
  const [readiness, setReadiness] = useState(() => ({ scope, ready: !pending }));
  let current = readiness;

  if (readiness.scope !== scope) {
    current = { scope, ready: !pending };
    setReadiness(current);
  } else if (!pending && !readiness.ready) {
    current = { scope, ready: true };
    setReadiness(current);
  }

  const blocking = pending && !current.ready;
  return <div className={styles.reader} data-panel-initial-reader={blocking ? "pending" : "ready"}>
    {boundary ? children : <InitialDataSurface pending={blocking}>{children}</InitialDataSurface>}
  </div>;
}
