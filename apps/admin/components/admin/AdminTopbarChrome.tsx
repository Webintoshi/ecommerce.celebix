"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type AdminTopbarChromeState = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
};

type AdminTopbarChromeSetter = (nextChrome: AdminTopbarChromeState | null) => void;

const AdminTopbarChromeContext = createContext<AdminTopbarChromeSetter | null>(null);

export function AdminTopbarChromeProvider({
  children,
  onChange,
}: {
  children: ReactNode;
  onChange: AdminTopbarChromeSetter;
}) {
  return (
    <AdminTopbarChromeContext.Provider value={onChange}>
      {children}
    </AdminTopbarChromeContext.Provider>
  );
}

export function useAdminTopbarChrome(chrome: AdminTopbarChromeState) {
  const setChrome = useContext(AdminTopbarChromeContext);

  useEffect(() => {
    if (!setChrome) {
      return;
    }

    setChrome({
      subtitle: chrome.subtitle,
      title: chrome.title,
    });

    return () => {
      setChrome(null);
    };
  }, [chrome.subtitle, chrome.title, setChrome]);
}

function useTopbarActionsTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    let frame = 0;

    const syncTarget = () => {
      setTarget(document.getElementById("admin-page-topbar-actions"));
    };

    frame = window.requestAnimationFrame(syncTarget);

    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return target;
}

export function AdminTopbarBridge(props: AdminTopbarChromeState) {
  useAdminTopbarChrome(props);
  const target = useTopbarActionsTarget();

  return target && props.actions ? createPortal(props.actions, target) : null;
}
