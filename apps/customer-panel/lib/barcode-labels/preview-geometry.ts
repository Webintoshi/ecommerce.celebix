import type { BarcodeLabelTemplateConfig } from "@celebix/saas-contracts";

export function previewPaddingPercentages(
  template: Pick<
    BarcodeLabelTemplateConfig,
    "widthMm" | "heightMm" | "marginsMm"
  >,
) {
  const { widthMm, heightMm, marginsMm } = template;
  return Object.freeze({
    paddingTop: `${(marginsMm.top / heightMm) * 100}%`,
    paddingRight: `${(marginsMm.right / widthMm) * 100}%`,
    paddingBottom: `${(marginsMm.bottom / heightMm) * 100}%`,
    paddingLeft: `${(marginsMm.left / widthMm) * 100}%`,
  });
}

export function normalizePaperTypeChange(
  current: BarcodeLabelTemplateConfig,
  paperType: BarcodeLabelTemplateConfig["paperType"],
): BarcodeLabelTemplateConfig {
  if (paperType === "a4") return Object.freeze({ ...current, paperType });
  return Object.freeze({
    ...current,
    paperType,
    orientation: "portrait",
    rows: 1,
    columns: 1,
  });
}
