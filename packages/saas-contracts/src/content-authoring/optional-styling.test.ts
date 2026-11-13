import assert from 'node:assert/strict';
import test from 'node:test';
import { stripOptionalStylingColor } from './optional-styling.ts';

test('masks only a normalized color describing a separate item in optional styling advice', () => {
  for (const text of [
    'dilerseniz beyaz bir gomlekle kombinleyebilirsiniz.',
    'isterseniz, bu etegi beyaz bir tisortle eslestirebilirsiniz!',
    'bu etek gundelik kullanim icin bir secenek. dilerseniz beyaz bir ceketle tamamlayabilirsiniz.',
  ]) {
    const result = stripOptionalStylingColor(text, 'beyaz');
    assert.equal(result, text.replace('beyaz', ' '.repeat(5)));
    assert.equal(result.length, text.length);
  }
  assert.equal(
    stripOptionalStylingColor('dilerseniz acik mavi gomlekle bu etegi bir araya getirebilirsiniz.', 'acik mavi'),
    'dilerseniz           gomlekle bu etegi bir araya getirebilirsiniz.',
  );
});

test('does not hide product attributes or style fragments with an attached claim', () => {
  for (const text of [
    'beyaz etek.',
    'beyaz bir gomlekle kombinleyebilirsiniz.',
    'dilerseniz beyaz bir gomlekle birlikte gelir.',
    'dilerseniz beyaz bir gomlekle kombinleyebilirsiniz ve etek beyazdir.',
    'dilerseniz beyaz bir gomlekle kombinleyebilirsiniz ve urunun rengi beyaz.',
    'dilerseniz beyaz bir urunle kombinleyebilirsiniz.',
    'dilerseniz beyaz pamuklu gomlekle kombinleyebilirsiniz.',
    'dilerseniz bu beyaz etegi kombinleyebilirsiniz.',
    'dilerseniz beyaz bir gomlekle kombinleyebilirsiniz; etek beyaz.',
  ]) assert.equal(stripOptionalStylingColor(text, 'beyaz'), text);
  for (const value of ['250', 'beyaz|deri', 'small / beyaz', 'deri', 'beyaz etek']) {
    const text = `dilerseniz ${value} bir gomlekle kombinleyebilirsiniz.`;
    assert.equal(stripOptionalStylingColor(text, value), text);
  }
});

test('a separate product claim remains available to the validator', () => {
  for (const text of [
    'dilerseniz beyaz bir gomlekle kombinleyebilirsiniz. etek beyaz renktedir.',
    'etek beyaz renktedir. dilerseniz beyaz bir gomlekle kombinleyebilirsiniz.',
  ]) {
    const result = stripOptionalStylingColor(text, 'beyaz');
    assert.equal(result, text.replace('beyaz bir gomlekle', '      bir gomlekle'));
    assert.ok(result.includes('etek beyaz renktedir'));
    assert.equal(result.length, text.length);
  }
});
