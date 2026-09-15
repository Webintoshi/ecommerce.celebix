import type { DesignEditorState } from "./workspace-model.ts";

// Browser-lifetime recovery only: no persistence, network authority or history
// payload. The page supplies an opaque scope for its authenticated session/store.
const drafts = new Map<string, DesignEditorState>();
const MAX_RETAINED_DRAFTS = 8;

export function readNavigationDraft(scope: string | undefined): DesignEditorState | undefined {
  return scope ? drafts.get(scope) : undefined;
}

export function forgetNavigationDraft(scope: string | undefined): void {
  if (scope) drafts.delete(scope);
}

export function retainNavigationDraft(scope: string | undefined, editor: DesignEditorState): void {
  if (!scope) return;
  drafts.delete(scope);
  if (editor.revision <= editor.savedRevision) return;
  drafts.set(scope, editor);
  if (drafts.size > MAX_RETAINED_DRAFTS) {
    const oldest = drafts.keys().next().value;
    if (oldest !== undefined) drafts.delete(oldest);
  }
}
