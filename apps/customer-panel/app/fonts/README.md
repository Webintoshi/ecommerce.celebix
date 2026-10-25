# Customer Panel font

`urbanist-variable.woff2` is the complete normal Urbanist variable font, with a
weight axis from 100 to 900 and Latin/Latin Extended coverage. The Customer Panel
loads this file locally with `next/font/local`; no font service is contacted at
build time or by the browser. The included `OFL.txt` applies to this font.

## Source

- Project: https://github.com/coreyhu/Urbanist
- Google Fonts commit: `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`
- Original TTF: https://raw.githubusercontent.com/google/fonts/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/urbanist/Urbanist%5Bwght%5D.ttf
- License: https://raw.githubusercontent.com/google/fonts/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/urbanist/OFL.txt
- Original TTF: 84,840 bytes; SHA-256 `748362d51eb276840e9f0023cd2d98299bf709a95fb3a5ae4ffcb624c638ebb9`
- Local WOFF2: 38,640 bytes; SHA-256 `373c3aa2f6c1ce8de6854b55c9e5054077be170aeb90247bb2e4c871baf02e30`

## Conversion and verification

The original font was converted without subsetting using FontTools 4.67.0 and
Brotli 1.2.1. The original timestamp was preserved:

```python
from fontTools.ttLib import TTFont

font = TTFont("Urbanist[wght].ttf", recalcTimestamp=False)
font.flavor = "woff2"
font.save("urbanist-variable.woff2")
```

The converted font retains all 491 Unicode mappings, including
`ÇĞİÖŞÜçğıöşü`, and the original normal weight axis. The source has no Turkish
lira sign (`₺`, U+20BA), so the interface keeps system font fallbacks for that
glyph. The source also has no `tnum` feature and its numerals have different
widths; `tabular-nums` alone does not align these digits.

Functional monospace fields and the merchant's storefront font previews retain
their own font choices.
