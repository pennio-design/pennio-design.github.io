#!/usr/bin/env python3
"""Rebuild the embedded Inter subset inside audit/checklist-source.html.

A print master that fetches its typeface at render time is not a master: it
renders differently depending on the network it runs on, and when the fetch
fails it falls back to a system face without saying so. So Inter is embedded.

Embedding the whole family is 843 KB and the variable font is still 422 KB, so
the faces are subset to the characters the document actually uses, which is 85
of them and 72 KB. The naira sign lives in latin-ext rather than latin, so both
subsets are kept and each carries a unicode-range computed from its own cmap.
Declaring Google's wider ranges instead would let the browser pick a face that
no longer has the glyph.

Run this after adding a character the document did not previously contain, then
re-render:

    pip install fonttools brotli
    python3 scripts/embed-inter.py
    node scripts/render-checklist.js

Requires network access to fonts.googleapis.com and fonts.gstatic.com.
"""
import base64
import html
import io
import os
import re
import subprocess
import sys
import tempfile

SRC = 'audit/checklist-source.html'
CSS_URL = ('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght'
           '@0,14..32,300..800;1,14..32,300..800&display=swap')
# css2 serves woff2 only to a browser UA; a default curl UA gets ttf.
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/131.0.0.0 Safari/537.36')
SUBSETS = ('latin', 'latin-ext')
BEGIN = '  /* BEGIN EMBEDDED INTER */'
END = '  /* END EMBEDDED INTER */'


def fetch(url, dest):
    subprocess.run(['curl', '-sSfL', '-A', UA, '-o', dest, url], check=True)


def document_characters(page_html):
    text = html.unescape(re.sub(r'<[^>]+>', ' ', page_html))
    return sorted({c for c in text if c.isprintable()})


def unicode_range(codepoints):
    cps, out, i = sorted(codepoints), [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append('U+%04X' % cps[i] if i == j else 'U+%04X-%04X' % (cps[i], cps[j]))
        i = j + 1
    return ', '.join(out)


def main():
    from fontTools.ttLib import TTFont

    source = io.open(SRC, encoding='utf-8').read()
    chars = document_characters(source[source.index('<body>'):])

    faces, total = [], 0
    with tempfile.TemporaryDirectory() as tmp:
        glyphs = os.path.join(tmp, 'glyphs.txt')
        io.open(glyphs, 'w', encoding='utf-8').write(''.join(chars))
        css = os.path.join(tmp, 'inter.css')
        fetch(CSS_URL, css)

        blocks = re.findall(r'/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{.*?\})',
                            io.open(css, encoding='utf-8').read(), re.S)
        for name, block in blocks:
            if name not in SUBSETS:
                continue
            url = re.search(r'url\((https://[^)]+)\)', block).group(1)
            raw = os.path.join(tmp, url.rsplit('/', 1)[-1])
            sub = raw + '.sub.woff2'
            fetch(url, raw)
            subprocess.run(['pyftsubset', raw, '--text-file=' + glyphs,
                            '--output-file=' + sub, '--flavor=woff2',
                            '--layout-features=*', '--no-hinting',
                            '--desubroutinize', '--ignore-missing-glyphs'],
                           check=True, capture_output=True)
            total += os.path.getsize(sub)
            style = 'italic' if re.search(r'font-style:\s*italic', block) else 'normal'
            faces.append((
                name, style,
                "  /* Inter variable, %s subset, %s. Subset to the %d characters this document uses. */\n"
                "  @font-face {\n"
                "    font-family: 'Inter';\n"
                "    font-style: %s;\n"
                "    font-weight: 300 800;\n"
                "    font-display: block;\n"
                "    src: url(data:font/woff2;base64,%s) format('woff2');\n"
                "    unicode-range: %s;\n"
                "  }" % (name, style, len(chars), style,
                         base64.b64encode(io.open(sub, 'rb').read()).decode(),
                         unicode_range(TTFont(sub).getBestCmap().keys()))))

    if len(faces) != len(SUBSETS) * 2:
        sys.exit('expected %d faces, built %d' % (len(SUBSETS) * 2, len(faces)))
    faces.sort(key=lambda f: (f[1] != 'normal', f[0] != 'latin'))

    start, stop = source.index(BEGIN), source.index(END)
    io.open(SRC, 'w', encoding='utf-8').write(
        source[:start] + BEGIN + '\n' + '\n'.join(f[2] for f in faces) + '\n' + source[stop:])
    print('embedded %d faces, %d characters, %.1f KB of woff2'
          % (len(faces), len(chars), total / 1024))


if __name__ == '__main__':
    main()
