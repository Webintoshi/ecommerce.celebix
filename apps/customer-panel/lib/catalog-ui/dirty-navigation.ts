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
