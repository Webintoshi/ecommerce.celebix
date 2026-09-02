import type {
  BarcodeLabelTemplate,
  BarcodeLabelTemplateConfig,
} from "@celebix/saas-contracts";

export type ActiveTemplateState = Readonly<{
  active?: BarcodeLabelTemplate;
  detached: boolean;
  name: string;
  config: BarcodeLabelTemplateConfig;
}>;

export function reconcileActiveTemplateMutation(
  current: ActiveTemplateState,
  affectedTemplateId: string,
  action: "rename" | "duplicate" | "default" | "archive",
  result: BarcodeLabelTemplate,
): ActiveTemplateState {
  if (action === "default" && current.active?.id !== affectedTemplateId) {
    if (!current.active?.isDefault) return current;
    return Object.freeze({
      ...current,
      active: Object.freeze({
        ...current.active,
        isDefault: false,
        version: current.active.version + 1,
        updatedAt: result.updatedAt,
      }),
    });
  }
  if (action === "duplicate" || current.active?.id !== affectedTemplateId)
    return current;
  if (action === "archive")
    return Object.freeze({
      detached: true,
      name: current.name,
      config: current.config,
    });
  return Object.freeze({
    active: result,
    detached: false,
    name: result.name,
    config: result.config,
  });
}
