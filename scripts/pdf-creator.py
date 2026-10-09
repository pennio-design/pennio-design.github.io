#!/usr/bin/env python3
"""Rewrite a Chromium-rendered PDF's /Creator string in place.

Skia stamps the browser's User-Agent into /Creator, so a document handed to a
lead announces "HeadlessChrome/141.0.0.0" in its properties panel. /Title comes
from the <title> tag and is already right; this fixes the one field that is not.

The rewrite is byte-for-byte the same length, because a PDF's cross-reference
table stores absolute byte offsets and a shorter string would move every object
after it. The slack is taken up with spaces after the closing parenthesis,
which are dictionary whitespace and belong to no value.

An earlier version padded inside the string with backslash-newline pairs. Those
are two bytes each, so an odd number of spare bytes could not be filled and the
script refused to run, telling the caller to rename the document. That happened
the first time Chromium's User-Agent changed length: the command written in
CLAUDE.md simply stopped working and left /Creator saying "Chromium". Padding
outside the string has no parity problem.

    python3 scripts/pdf-creator.py audit/pennio-brand-checklist.pdf "PENNIO."
"""
import re
import sys

PAT = re.compile(rb'/Creator\s*\((?:\\.|[^()\\]|\((?:\\.|[^()\\])*\))*\)', re.S)


def rewrite(path, creator):
    data = open(path, 'rb').read()
    old = PAT.search(data)
    if not old:
        sys.exit('no /Creator entry in %s' % path)

    head = b'/Creator ('
    body = creator.encode('ascii')
    room = len(old.group(0)) - len(head) - len(b')')
    pad = room - len(body)
    if pad < 0:
        sys.exit('/Creator %r needs %d bytes, only %d available' % (creator, len(body), room))

    new = head + body + b')' + b' ' * pad
    assert len(new) == len(old.group(0)), (len(new), len(old.group(0)))
    open(path, 'wb').write(data[:old.start()] + new + data[old.end():])
    print('%s: /Creator -> %s' % (path, creator))


if __name__ == '__main__':
    rewrite(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'PENNIO.')
