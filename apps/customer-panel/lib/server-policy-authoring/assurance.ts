const BLOCKED_ASSURANCE = /(?:tamamen|tam|yüzde yüz|%\s*100)\s+(?:kvkk(?:'ya)?\s+)?uyumlu|hukuken\s+onayl[ıi]|mutlak\s+güvenli/u;
const DISCLAIMER = /(^|[;.!?\n])([ \t]*(?:(?:ancak|fakat|ama)\s+)?bu\s+(?:metin|politika|açıklama),?\s+(?:(?:hesabınızın\s+)?mutlak\s+güvenli(?:ğini|ği)\s+garanti\s+etmez|mutlak\s+güvenlik\s+garantisi\s+vermez))(?=[ \t]*(?:[;.!?](?=\s|$)|$))/gu;
const METALINGUISTIC_DENIAL = /(?:^|[^\p{L}\p{N}])(?:demiyoruz|denemez|diyemeyiz|söylemiyoruz|söyleyemeyiz|kastetmiyoruz|savunmuyoruz|redded[\p{L}]*|iddia\s+etmiyoruz|kabul\s+etmiyoruz|katılmıyoruz|yanlıştır|doğru\s+değildir)(?=$|[^\p{L}\p{N}])/u;
const letter = (value: string | undefined) => value !== undefined && /[\p{L}\p{N}]/u.test(value);

function quoted(text: string, start: number, end: number): boolean {
  let closing: string | null = null;
  const pairs: Readonly<Record<string, string>> = { '"': '"', "'": "'", '“': '”', '‘': '’', '«': '»' };
  for (let index = 0; index < end; index++) {
    const character = text[index]!;
    if ((character === "'" || character === '’') && letter(text[index - 1]) && letter(text[index + 1])) continue;
    if (index === start && closing !== null) return true;
    if (index >= start && (character in pairs || ['”', '’', '»'].includes(character))) return true;
    if (closing === character) closing = null;
    else if (closing === null && character in pairs) closing = pairs[character]!;
  }
  return false;
}

/** Only an independent grammatical disclaimer can exclude an otherwise blocked phrase. */
export function containsUnsupportedPolicyAssurance(markdown: string): boolean {
  const text = markdown.normalize('NFKC').toLocaleLowerCase('tr').replace(/\r\n?/gu, '\n').replace(/\*\*|__/gu, '');
  const remaining = text.replace(DISCLAIMER, (match: string, boundary: string, clause: string, offset: number) => {
    const start = offset + boundary.length, end = start + clause.length;
    const before = text.lastIndexOf('\n\n', start), after = text.indexOf('\n\n', end);
    const paragraph = text.slice(before < 0 ? 0 : before + 2, after < 0 ? text.length : after);
    const followingBlock = after < 0 ? '' : text.slice(after + 2).trimStart().split(/\n[ \t]*\n/u, 1)[0]!.split(/[.!?]/u, 1)[0]!;
    const counterstatement = /^(?:bu\s+(?:ifade(?:yi|ye|nin)?|iddia(?:yı|ya|nın)?|söz(?:ü|e|ün)?|açıklama(?:yı|ya|nın)?|cümle(?:yi|ye|nin)?|görüş(?:ü|e|ün)?)|bunu|aksini|tersini)(?=\s|[,;:]|$)/u.test(followingBlock) && METALINGUISTIC_DENIAL.test(followingBlock);
    if (quoted(text, start, end) || METALINGUISTIC_DENIAL.test(paragraph) || counterstatement) return match;
    return boundary;
  });
  return BLOCKED_ASSURANCE.test(remaining);
}
