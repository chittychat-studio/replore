#!/usr/bin/env python3
"""SPEC RS85: the plugin's directory icon, `.claude-plugin/icon.png`, a 512x512 PNG.

Standard library only (zlib + struct, no Pillow): the compass mark of `web/favicon.svg` (ring, needle, hub) in the
page's light palette (`web/index.html` :root: --bg, --accent, --accent-ink), on a plain square, no text, no glyphs
(RS55). Anti-aliased by 4x4 supersampling. Deterministic: the same bytes every run, so a test can rebuild it.

Run: python ops/make_icon.py            (writes .claude-plugin/icon.png)
"""
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".claude-plugin" / "icon.png"
SIZE = 512
SS = 4                       # supersamples per axis
SCALE = SIZE / 32.0          # favicon.svg has viewBox 0 0 32 32

BG = (0xF4, 0xF6, 0xF8)      # --bg
RING = (0x3F, 0x6F, 0x8E)    # --accent   (.r stroke)
NEEDLE = (0x22, 0x37, 0x4A)  # --accent-ink (.n fill, .h stroke)
HUB = (0xFF, 0xFF, 0xFF)     # .h fill

# favicon.svg shapes, in its 32-unit space
CX = CY = 16.0
RING_R, RING_W = 12.5, 2.6
NEEDLE_PTS = [(21.8, 10.2), (17.4, 17.4), (10.2, 21.8), (14.6, 14.6)]
HUB_R, HUB_W = 1.9, 1.4


def _inside_convex(px, py, pts):
    sign = 0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        c = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
        if c != 0:
            s = 1 if c > 0 else -1
            if sign and s != sign:
                return False
            sign = s
    return True


def _colour(x, y):
    """Colour of one sample point (in the 32-unit space); later shapes paint over earlier ones, as in the SVG."""
    dx, dy = x - CX, y - CY
    d2 = dx * dx + dy * dy
    c = BG
    if (RING_R - RING_W / 2) ** 2 <= d2 <= (RING_R + RING_W / 2) ** 2:
        c = RING
    if _inside_convex(x, y, NEEDLE_PTS):
        c = NEEDLE
    if d2 <= (HUB_R + HUB_W / 2) ** 2:
        c = NEEDLE if d2 >= (HUB_R - HUB_W / 2) ** 2 else HUB
    return c


def render():
    rows = []
    n = SS * SS
    for py in range(SIZE):
        row = bytearray([0])   # filter type 0 (None) for every scanline
        for px in range(SIZE):
            r = g = b = 0
            for sy in range(SS):
                for sx in range(SS):
                    cr, cg, cb = _colour((px + (sx + 0.5) / SS) / SCALE, (py + (sy + 0.5) / SS) / SCALE)
                    r += cr
                    g += cg
                    b += cb
            row += bytes((round(r / n), round(g / n), round(b / n)))
        rows.append(bytes(row))
    return b"".join(rows)


def _chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def png_bytes(raw, size=SIZE):
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)   # 8-bit RGB, no interlace
    return (b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(raw, 9))
            + _chunk(b"IEND", b""))


def main(argv=None):
    out = Path((argv or sys.argv[1:] or [str(OUT)])[0])
    out.write_bytes(png_bytes(render()))
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
