type BeforeUnloadEventLike = {
  preventDefault(): void;
  returnValue?: string;
};

type BeforeUnloadTarget = {
  addEventListener(type: "beforeunload", listener: (event: BeforeUnloadEventLike) => void): void;
  removeEventListener(type: "beforeunload", listener: (event: BeforeUnloadEventLike) => void): void;
};

type DirtyNavigationGuardOptions = Readonly<{
  isDirty(): boolean;
  confirm(): boolean;
}>;

type ApplicationAnchor = Readonly<{
  href: string;
  target?: string;
  hasAttribute(name: string): boolean;
}>;

export function createDirtyNavigationGuard(options: DirtyNavigationGuardOptions) {
  return Object.freeze({
    canLeave(): boolean {
      return !options.isDirty() || options.confirm();
    },
    bindBeforeUnload(target: BeforeUnloadTarget): () => void {
      const listener = (event: BeforeUnloadEventLike) => {
        if (!options.isDirty()) return;
        event.preventDefault();
        event.returnValue = "";
      };
      target.addEventListener("beforeunload", listener);
      return () => target.removeEventListener("beforeunload", listener);
    },
    bindApplicationNavigation(target: Document, currentUrl: () => string): () => void {
      const listener = (event: MouseEvent) => {
        if (!options.isDirty() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const eventTarget = event.target as { closest?(selector: string): ApplicationAnchor | null } | null;
        const anchor = eventTarget?.closest?.("a[href]") ?? null;
        if (anchor === null || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
        const current = new URL(currentUrl());
        const destination = new URL(anchor.href, current);
        if (
          destination.origin !== current.origin
          || (destination.pathname === current.pathname && destination.search === current.search)
          || options.confirm()
        ) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      target.addEventListener("click", listener, true);
      return () => target.removeEventListener("click", listener, true);
    },
  });
}

export function createDirtyEditorRegistry<const Editor extends string>(editors: readonly Editor[]) {
  const dirty = new Set<Editor>();
  const allowed = new Set(editors);
  const validate = (editor: Editor) => {
    if (!allowed.has(editor)) throw new Error("unknown_dirty_editor");
  };
  return Object.freeze({
    mark(editor: Editor) {
      validate(editor);
      dirty.add(editor);
    },
    clear(editor: Editor) {
      validate(editor);
      dirty.delete(editor);
    },
    clearAll() {
      dirty.clear();
    },
    isDirty(editor: Editor) {
      validate(editor);
      return dirty.has(editor);
    },
    anyDirty() {
      return dirty.size > 0;
    },
    dirtyEditors(): readonly Editor[] {
      return Object.freeze(editors.filter((editor) => dirty.has(editor)));
    },
  });
}
