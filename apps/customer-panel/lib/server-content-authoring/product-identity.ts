import type { ContentAuthoringField } from '../../../../packages/saas-contracts/src/content-authoring/types.ts';

const fold = (text: string) => text.normalize('NFC').toLocaleLowerCase('tr-TR');
const pasta = /(?<!\p{L})(?:erişte|makarna)(?!\p{L})/u;
const grain = /(?<!\p{L})(?:siyez|greçka|karabuğday)(?!\p{L})/u;
const wholeGrainCopy = /tane formu|(?<!\p{L})taneler(?:i|ini|le|iyle|in)(?!\p{L})|(?<!\p{L})(?:siyez|greçka|karabuğday)\s+tane\p{L}*|(?:siyez|greçka|karabuğday)(?:ı|yı|yi|la|yla|yle|da|de)?\s+.{0,25}pilav/u;

export function contradictsProductForm(title: string, copy: string): boolean {
  const identity = fold(title);
  return pasta.test(identity) && grain.test(identity) && wholeGrainCopy.test(fold(copy));
}

export function preserveSeoProductName(field: Exclude<ContentAuthoringField, 'description'>, text: string, title: string): string {
  const productName = title.trim().normalize('NFC');
  const limit = field === 'seoTitle' ? 60 : 160;
  if (productName.length > limit || fold(text).includes(fold(productName))) return text;
  const intro = productName + ' hakkında bilgi alın.';
  return field === 'seoTitle' || intro.length > limit ? productName : intro;
}
