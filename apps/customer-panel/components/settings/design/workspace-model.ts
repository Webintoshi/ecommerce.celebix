import type { StorefrontDesignDocument, StorefrontDesignDraftMutation, StorefrontDesignWorkspace } from "@celebix/saas-contracts";

export type DesignEditorStatus = "saved" | "dirty" | "saving" | "publishing" | "error" | "conflict";
export type DesignEditorState = Readonly<{ design: StorefrontDesignDocument; draftVersion: number; publishedVersion: number; revision: number; savedRevision: number; status: DesignEditorStatus }>;
export type DesignSaveToken = Readonly<{ revision: number; design: StorefrontDesignDocument }>;

export function createDesignEditorState(workspace: Pick<StorefrontDesignWorkspace, "draft" | "draftVersion" | "publishedVersion">): DesignEditorState {
  return Object.freeze({ design: workspace.draft, draftVersion: workspace.draftVersion, publishedVersion: workspace.publishedVersion, revision: 0, savedRevision: 0, status: "saved" });
}

export function applyDesignEdit(state: DesignEditorState, design: StorefrontDesignDocument): DesignEditorState {
  return Object.freeze({ ...state, design, revision: state.revision + 1, status: "dirty" as const });
}

export function beginDesignSave(state: DesignEditorState): Readonly<{ state: DesignEditorState; token: DesignSaveToken }> {
  return Object.freeze({ state: Object.freeze({ ...state, status: "saving" as const }), token: Object.freeze({ revision: state.revision, design: state.design }) });
}

export function completeDesignSave(state: DesignEditorState, token: DesignSaveToken, mutation: StorefrontDesignDraftMutation): DesignEditorState {
  return Object.freeze({ ...state, draftVersion: mutation.draftVersion, savedRevision: Math.max(state.savedRevision, token.revision), status: state.revision === token.revision ? "saved" as const : "dirty" as const });
}
