'use client';

import {useCallback,useEffect,useRef,useState} from 'react';

type DiscardAction = () => void | Promise<void>;
type TraverseEvent = Event & {
  navigationType?: string;
  destination?: {url: string; sameDocument?: boolean};
};

/** Keeps the confirmation in the current editor instead of opening a second modal. */
export function useSeoUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  const actionRef = useRef<DiscardAction | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const returnFocusId = useRef('');
  const restoreFocus = useRef(false);
  const [confirming, setConfirming] = useState(false);
  dirtyRef.current = dirty;

  const reset = useCallback(() => {
    dirtyRef.current = false;
    actionRef.current = null;
    setConfirming(false);
  }, []);
  const requestDiscard = useCallback((action: DiscardAction) => {
    if (!dirtyRef.current) { void action(); return; }
    actionRef.current = action;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    returnFocusId.current = returnFocus.current?.id ?? '';
    setConfirming(true);
  }, []);
  const cancelDiscard = useCallback(() => {
    actionRef.current = null;
    restoreFocus.current = true;
    setConfirming(false);
  }, []);
  const confirmDiscard = useCallback(() => {
    const action = actionRef.current;
    reset();
    if (action) void action();
  }, [reset]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function captureLink(event: MouseEvent) {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.hasAttribute('download') || link.target && link.target !== '_self') return;
      const destination = new URL(link.href, window.location.href);
      if (!['http:', 'https:'].includes(destination.protocol) || destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      requestDiscard(() => window.location.assign(destination.href));
    }
    function traverse(event: TraverseEvent) {
      if (!dirtyRef.current || !event.cancelable || event.navigationType !== 'traverse' || !event.destination?.sameDocument) return;
      const destination = new URL(event.destination.url, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault();
      requestDiscard(() => window.location.assign(destination.href));
    }
    const navigation = (window as Window & {navigation?: EventTarget}).navigation;
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', captureLink, true);
    navigation?.addEventListener('navigate', traverse);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', captureLink, true);
      navigation?.removeEventListener('navigate', traverse);
    };
  }, [requestDiscard]);

  useEffect(() => {
    if (!confirming && restoreFocus.current) {
      restoreFocus.current = false;
      const target = returnFocus.current?.isConnected ? returnFocus.current : returnFocusId.current ? document.getElementById(returnFocusId.current) : null;
      target?.focus();
    }
    if (!confirming) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); cancelDiscard(); }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [cancelDiscard, confirming]);

  return {confirming,requestDiscard,cancelDiscard,confirmDiscard,reset};
}
