#!/usr/bin/env python3
"""Builds the fonts used by the app and the website.

1. "Halyra Pixel" - an original 5x7 bitmap-style font for the retro themes,
   drawn here glyph by glyph (incl. Hungarian accents). Licensed with the app.
2. Subsets of Inter (SIL Open Font License) for the normal themes.

Usage: python3 tools/make_fonts.py <out_dir> [<out_dir> ...]
"""
import os
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools import subset
from fontTools.ttLib import TTFont

PX = 100          # font units per pixel
ADV = 6 * PX      # 5 px glyph + 1 px spacing

# Rows are listed top to bottom. 7 rows = cap height (rows 6..0).
# Lowercase glyphs have 9 rows: rows 6..0 then descender rows -1, -2.
U = {
    'A': ".XXX. X...X X...X XXXXX X...X X...X X...X", 'B': "XXXX. X...X X...X XXXX. X...X X...X XXXX.",
    'C': ".XXX. X...X X.... X.... X.... X...X .XXX.", 'D': "XXXX. X...X X...X X...X X...X X...X XXXX.",
    'E': "XXXXX X.... X.... XXXX. X.... X.... XXXXX", 'F': "XXXXX X.... X.... XXXX. X.... X.... X....",
    'G': ".XXX. X...X X.... X.XXX X...X X...X .XXXX", 'H': "X...X X...X X...X XXXXX X...X X...X X...X",
    'I': ".XXX. ..X.. ..X.. ..X.. ..X.. ..X.. .XXX.", 'J': "..XXX ...X. ...X. ...X. ...X. X..X. .XX..",
    'K': "X...X X..X. X.X.. XX... X.X.. X..X. X...X", 'L': "X.... X.... X.... X.... X.... X.... XXXXX",
    'M': "X...X XX.XX X.X.X X.X.X X...X X...X X...X", 'N': "X...X X...X XX..X X.X.X X..XX X...X X...X",
    'O': ".XXX. X...X X...X X...X X...X X...X .XXX.", 'P': "XXXX. X...X X...X XXXX. X.... X.... X....",
    'Q': ".XXX. X...X X...X X...X X.X.X X..X. .XX.X", 'R': "XXXX. X...X X...X XXXX. X.X.. X..X. X...X",
    'S': ".XXXX X.... X.... .XXX. ....X ....X XXXX.", 'T': "XXXXX ..X.. ..X.. ..X.. ..X.. ..X.. ..X..",
    'U': "X...X X...X X...X X...X X...X X...X .XXX.", 'V': "X...X X...X X...X X...X X...X .X.X. ..X..",
    'W': "X...X X...X X...X X.X.X X.X.X X.X.X .X.X.", 'X': "X...X X...X .X.X. ..X.. .X.X. X...X X...X",
    'Y': "X...X X...X .X.X. ..X.. ..X.. ..X.. ..X..", 'Z': "XXXXX ....X ...X. ..X.. .X... X.... XXXXX",
    '0': ".XXX. X...X X..XX X.X.X XX..X X...X .XXX.", '1': "..X.. .XX.. ..X.. ..X.. ..X.. ..X.. .XXX.",
    '2': ".XXX. X...X ....X ...X. ..X.. .X... XXXXX", '3': "XXXXX ...X. ..X.. ...X. ....X X...X .XXX.",
    '4': "...X. ..XX. .X.X. X..X. XXXXX ...X. ...X.", '5': "XXXXX X.... XXXX. ....X ....X X...X .XXX.",
    '6': "..XX. .X... X.... XXXX. X...X X...X .XXX.", '7': "XXXXX ....X ...X. ..X.. .X... .X... .X...",
    '8': ".XXX. X...X X...X .XXX. X...X X...X .XXX.", '9': ".XXX. X...X X...X .XXXX ....X ...X. .XX..",
    ' ': "..... ..... ..... ..... ..... ..... .....", '!': "..X.. ..X.. ..X.. ..X.. ..X.. ..... ..X..",
    '"': ".X.X. .X.X. ..... ..... ..... ..... .....", '#': ".X.X. .X.X. XXXXX .X.X. XXXXX .X.X. .X.X.",
    '$': "..X.. .XXXX X.X.. .XXX. ..X.X XXXX. ..X..", '%': "XX... XX..X ...X. ..X.. .X... X..XX ...XX",
    '&': ".XX.. X..X. X.X.. .X... X.X.X X..X. .XX.X", "'": "..X.. ..X.. ..... ..... ..... ..... .....",
    '(': "...X. ..X.. .X... .X... .X... ..X.. ...X.", ')': ".X... ..X.. ...X. ...X. ...X. ..X.. .X...",
    '*': "..... ..X.. X.X.X .XXX. X.X.X ..X.. .....", '+': "..... ..X.. ..X.. XXXXX ..X.. ..X.. .....",
    '-': "..... ..... ..... .XXX. ..... ..... .....", '.': "..... ..... ..... ..... ..... ..... ..X..",
    '/': "....X ....X ...X. ..X.. .X... X.... X....", ':': "..... ..X.. ..... ..... ..... ..X.. .....",
    '<': "...X. ..X.. .X... X.... .X... ..X.. ...X.", '=': "..... ..... XXXXX ..... XXXXX ..... .....",
    '>': ".X... ..X.. ...X. ....X ...X. ..X.. .X...", '?': ".XXX. X...X ....X ...X. ..X.. ..... ..X..",
    '@': ".XXX. X...X X.XXX X.X.X X.XXX X.... .XXXX", '[': ".XXX. .X... .X... .X... .X... .X... .XXX.",
    ']': ".XXX. ...X. ...X. ...X. ...X. ...X. .XXX.", '\\': "X.... X.... .X... ..X.. ...X. ....X ....X",
    '^': "..X.. .X.X. X...X ..... ..... ..... .....", '_': "..... ..... ..... ..... ..... ..... XXXXX",
    '`': ".X... ..X.. ..... ..... ..... ..... .....", '|': "..X.. ..X.. ..X.. ..X.. ..X.. ..X.. ..X..",
    '{': "...XX ..X.. ..X.. XX... ..X.. ..X.. ...XX", '}': "XX... ..X.. ..X.. ...XX ..X.. ..X.. XX...",
    '~': "..... ..... .X... X.X.X ...X. ..... .....",
    '·': "..... ..... ..... ..X.. ..... ..... .....", '•': "..... ..... .XXX. .XXX. .XXX. ..... .....",
    '…': "..... ..... ..... ..... ..... ..... X.X.X", '–': "..... ..... ..... XXXXX ..... ..... .....",
    '—': "..... ..... ..... XXXXX ..... ..... .....", '→': "..... ..X.. ...X. XXXXX ...X. ..X.. .....",
    '←': "..... ..X.. .X... XXXXX .X... ..X.. .....", '✓': "..... ....X ...X. X.X.. .X... ..... .....",
    '×': "..... X...X .X.X. ..X.. .X.X. X...X .....", '€': "..XXX .X... XXXX. .X... XXXX. .X... ..XXX",
    '“': ".X.X. .X.X. ..... ..... ..... ..... .....", '”': ".X.X. .X.X. ..... ..... ..... ..... .....",
    '‘': "..X.. ..X.. ..... ..... ..... ..... .....", '’': "..X.. ..X.. ..... ..... ..... ..... .....",
    '↑': "..X.. .XXX. X.X.X ..X.. ..X.. ..X.. .....", '↓': "..... ..X.. ..X.. ..X.. X.X.X .XXX. ..X..",
    '°': ".XX.. X..X. .XX.. ..... ..... ..... .....",
}
# 9 rows (6..-2)
L = {
    'a': "..... ..... .XXX. ....X .XXXX X...X .XXXX ..... .....",
    'b': "X.... X.... X.XX. XX..X X...X X...X XXXX. ..... .....",
    'c': "..... ..... .XXX. X.... X.... X...X .XXX. ..... .....",
    'd': "....X ....X .XX.X X..XX X...X X...X .XXXX ..... .....",
    'e': "..... ..... .XXX. X...X XXXXX X.... .XXX. ..... .....",
    'f': "..XX. .X..X .X... XXX.. .X... .X... .X... ..... .....",
    'g': "..... ..... .XXXX X...X X...X .XXXX ....X X...X .XXX.",
    'h': "X.... X.... X.XX. XX..X X...X X...X X...X ..... .....",
    'i': "..X.. ..... .XX.. ..X.. ..X.. ..X.. .XXX. ..... .....",
    'j': "...X. ..... ..XX. ...X. ...X. ...X. ...X. X..X. .XX..",
    'k': "X.... X.... X..X. X.X.. XX... X.X.. X..X. ..... .....",
    'l': ".XX.. ..X.. ..X.. ..X.. ..X.. ..X.. .XXX. ..... .....",
    'm': "..... ..... XX.X. X.X.X X.X.X X...X X...X ..... .....",
    'n': "..... ..... X.XX. XX..X X...X X...X X...X ..... .....",
    'o': "..... ..... .XXX. X...X X...X X...X .XXX. ..... .....",
    'p': "..... ..... XXXX. X...X X...X XXXX. X.... X.... X....",
    'q': "..... ..... .XXXX X...X X...X .XXXX ....X ....X ....X",
    'r': "..... ..... X.XX. XX..X X.... X.... X.... ..... .....",
    's': "..... ..... .XXXX X.... .XXX. ....X XXXX. ..... .....",
    't': ".X... .X... XXX.. .X... .X... .X..X ..XX. ..... .....",
    'u': "..... ..... X...X X...X X...X X..XX .XX.X ..... .....",
    'v': "..... ..... X...X X...X X...X .X.X. ..X.. ..... .....",
    'w': "..... ..... X...X X...X X.X.X X.X.X .X.X. ..... .....",
    'x': "..... ..... X...X .X.X. ..X.. .X.X. X...X ..... .....",
    'y': "..... ..... X...X X...X X...X .XXXX ....X X...X .XXX.",
    'z': "..... ..... XXXXX ...X. ..X.. .X... XXXXX ..... .....",
    ',': "..... ..... ..... ..... ..... ..X.. ..X.. .X... .....",
    ';': "..... ..X.. ..... ..... ..... ..X.. ..X.. .X... .....",
    '„': "..... ..... ..... ..... ..... .X.X. .X.X. X.X.. .....",
}
ACC = {'acute': "...X. ..X..", 'uml': "..... .X.X.", 'dbl': "..X.X .X.X."}
COMPOSE = {
    'Á': ('A', 'acute'), 'É': ('E', 'acute'), 'Í': ('I', 'acute'), 'Ó': ('O', 'acute'),
    'Ö': ('O', 'uml'), 'Ő': ('O', 'dbl'), 'Ú': ('U', 'acute'), 'Ü': ('U', 'uml'), 'Ű': ('U', 'dbl'),
    'Ä': ('A', 'uml'),
    'á': ('a', 'acute'), 'é': ('e', 'acute'), 'í': ('ı', 'acute'), 'ó': ('o', 'acute'),
    'ö': ('o', 'uml'), 'ő': ('o', 'dbl'), 'ú': ('u', 'acute'), 'ü': ('u', 'uml'), 'ű': ('u', 'dbl'),
    'ä': ('a', 'uml'),
}
L['ı'] = "..... ..... .XX.. ..X.. ..X.. ..X.. .XXX. ..... ....."  # dotless i


def pixels(ch):
    """Return set of (col, row) with row 0 = baseline row, rows grow upward."""
    on = set()
    if ch in U:
        rows = U[ch].split()
        for i, r in enumerate(rows):
            y = 6 - i
            for x, c in enumerate(r):
                if c == 'X':
                    on.add((x, y))
    elif ch in L:
        rows = L[ch].split()
        for i, r in enumerate(rows):
            y = 6 - i
            for x, c in enumerate(r):
                if c == 'X':
                    on.add((x, y))
    elif ch in COMPOSE:
        base, acc = COMPOSE[ch]
        on |= pixels(base)
        top = 9 if base.isupper() else 7  # accent rows above a 1-row gap
        for i, r in enumerate(ACC[acc].split()):
            y = top - i
            for x, c in enumerate(r):
                if c == 'X':
                    on.add((x, y))
    return on


def rects(on):
    """Greedy merge of pixels into rectangles (fewer contours, no seams)."""
    left = set(on)
    out = []
    while left:
        x, y = min(left, key=lambda p: (-p[1], p[0]))
        w = 1
        while (x + w, y) in left:
            w += 1
        h = 1
        while all((x + i, y - h) in left for i in range(w)):
            h += 1
        for i in range(w):
            for j in range(h):
                left.discard((x + i, y - j))
        out.append((x, y - h + 1, w, h))
    return out


def build_pixel_font(path):
    chars = sorted(set(U) | set(L) | set(COMPOSE))
    names = ['.notdef'] + [f'uni{ord(c):04X}' for c in chars]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({ord(c): f'uni{ord(c):04X}' for c in chars if c != 'ı' or True})
    glyphs = {}
    metrics = {}
    pen = TTGlyphPen(None)
    pen.moveTo((PX, 0)); pen.lineTo((PX, 7 * PX)); pen.lineTo((4 * PX, 7 * PX)); pen.lineTo((4 * PX, 0)); pen.closePath()
    glyphs['.notdef'] = pen.glyph()
    metrics['.notdef'] = (ADV, PX)
    for c in chars:
        pen = TTGlyphPen(None)
        rs = rects(pixels(c))
        for (x, y, w, h) in rs:
            x0, y0, x1, y1 = x * PX, y * PX, (x + w) * PX, (y + h) * PX
            pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
        g = pen.glyph()
        name = f'uni{ord(c):04X}'
        glyphs[name] = g
        lsb = min((r[0] for r in rs), default=0) * PX
        metrics[name] = (ADV, lsb)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=1000, descent=-200)
    fb.setupNameTable({'familyName': 'Halyra Pixel', 'styleName': 'Regular', 'copyright': '(c) Halyra. Free to use with Halyra Focus.'})
    fb.setupOS2(sTypoAscender=1000, sTypoDescender=-200, sTypoLineGap=0, usWinAscent=1000, usWinDescent=200, sxHeight=500, sCapHeight=700)
    fb.setupPost()
    fb.font.flavor = 'woff'
    fb.save(path)
    return len(chars)


INTER = '/usr/share/fonts/opentype/inter'
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x201E, 0x2022, 0x2026, 0x20AC, 0x2190, 0x2192, 0x2191, 0x2193, 0x2713, 0x00D7, 0x2212]


def build_inter(out_dir):
    for weight in ['Regular', 'Medium', 'SemiBold', 'Bold']:
        src = os.path.join(INTER, f'Inter-{weight}.otf')
        f = TTFont(src)
        opts = subset.Options()
        opts.flavor = 'woff'
        opts.layout_features = ['kern', 'liga', 'calt', 'tnum', 'case', 'ss01', 'cv11']
        opts.name_IDs = ['*']
        s = subset.Subsetter(opts)
        s.populate(unicodes=UNICODES)
        s.subset(f)
        f.flavor = 'woff'
        f.save(os.path.join(out_dir, f'Inter-{weight}.woff'))


if __name__ == '__main__':
    for out in sys.argv[1:]:
        os.makedirs(out, exist_ok=True)
        n = build_pixel_font(os.path.join(out, 'HalyraPixel.woff'))
        build_inter(out)
        print(out, 'pixel glyphs:', n)
