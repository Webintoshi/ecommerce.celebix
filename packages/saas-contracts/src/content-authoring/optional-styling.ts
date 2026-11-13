const stylingColors = new Set([
  'bej', 'beyaz', 'bordo', 'gri', 'haki', 'kahverengi', 'kirmizi', 'krem', 'lacivert', 'mavi',
  'mor', 'pembe', 'sari', 'siyah', 'turuncu', 'yesil', 'acik mavi', 'koyu mavi',
]);

const productObject = '(?:bu )?(?:urunu|etegi|pantolonu|elbiseyi|bluzu|ceketi|gomlegi|takimi)';
const companion = '(?:gomlekle|tisortle|bluzla|kazakla|hirkayla|ceketle|kabanla|montla|ayakkabiyla|sneakerla|sandaletle|botla|cantayla|kemerle|salla|fularla)';
const combine = '(?:kombinleyebilirsiniz|eslestirebilirsiniz|tamamlayabilirsiniz|bir araya getirebilirsiniz)';

/** Inputs are normalized. Mask only the separate item's color in a closed styling sentence. */
export function stripOptionalStylingColor(text: string, value: string): string {
  if (!stylingColors.has(value)) return text;
  const suggestion = new RegExp(`^((?:dilerseniz|isterseniz),? (?:${productObject} )?)${value}((?: bir)? ${companion} (?:${productObject} )?${combine})$`, 'u');
  return text.replace(/(^|[.!?] )([^.!?]+)(?=[.!?](?: |$)|$)/gu, (sentence, boundary: string, body: string) => {
    const match = suggestion.exec(body);
    if (!match) return sentence;
    return boundary + match[1] + ' '.repeat(value.length) + match[2];
  });
}
