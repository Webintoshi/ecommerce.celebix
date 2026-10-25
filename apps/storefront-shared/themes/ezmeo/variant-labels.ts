const MASS = /^(\d+(?:[.,]\d+)?)\s*(g|gr|gram|kg|kilogram)$/iu;

export function ezmeoVariantTitle(title: string): string {
  const match = MASS.exec(title.trim());
  if (!match) return title;
  const grams = Number(match[1].replace(",", ".")) * (/^(kg|kilogram)$/iu.test(match[2]) ? 1000 : 1);
  return grams >= 1000 ? `${(grams / 1000).toLocaleString("tr-TR")} kg` : `${grams.toLocaleString("tr-TR")} g`;
}

export function ezmeoVariantHeading(titles: readonly string[]): string {
  return titles.length > 0 && titles.every(title => MASS.test(title.trim())) ? "Gramaj" : "Seçenekler";
}
