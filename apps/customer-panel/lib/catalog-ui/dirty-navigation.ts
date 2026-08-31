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
