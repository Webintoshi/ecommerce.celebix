import type { LabelDocument, LabelDocumentItem } from "./document.ts";

export type LabelPageEntry = LabelDocumentItem | undefined;

export function paginateLabelDocument(
  document: LabelDocument,
): readonly (readonly LabelPageEntry[])[] {
  const labels = document.items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => item),
  );
  if (document.template.paperType !== "a4") return Object.freeze([labels]);
  const capacity = document.template.rows * document.template.columns;
  const pages: LabelPageEntry[][] = [];
  let offset = 0;
  let first = true;
  while (offset < labels.length) {
    const blanks = first ? document.startCell : 0;
    const page: LabelPageEntry[] = Array.from(
      { length: blanks },
      () => undefined,
    );
    page.push(...labels.slice(offset, offset + capacity - blanks));
    offset += capacity - blanks;
    while (page.length < capacity) page.push(undefined);
    pages.push(page);
    first = false;
  }
  return Object.freeze(pages.map((page) => Object.freeze(page)));
}
