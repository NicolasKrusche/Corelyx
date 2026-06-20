"""Generate a 1024x1024 placeholder source PNG for `tauri icon`.

No third-party deps — encodes a PNG by hand (dark background with a rounded
indigo tile and a simple 'C' cut-out). Replace with real branding later via
`pnpm tauri icon path/to/logo.png`.
"""
import struct
import zlib

S = 1024
BG = (12, 12, 13, 255)        # #0C0C0D
TILE = (99, 102, 241, 255)    # indigo #6366F1
FG = (250, 250, 250, 255)     # near-white

# Tile geometry (rounded square) and a chunky 'C' glyph carved from it.
m = 176                       # margin
r = 120                       # corner radius
tile_lo, tile_hi = m, S - m
cx, cy = S // 2, S // 2
c_outer = 300                 # outer radius of the C ring
c_inner = 188                 # inner radius of the C ring


def in_rounded(x, y):
    if not (tile_lo <= x < tile_hi and tile_lo <= y < tile_hi):
        return False
    # Round the four corners.
    for ox, oy in ((tile_lo + r, tile_lo + r), (tile_hi - r, tile_lo + r),
                   (tile_lo + r, tile_hi - r), (tile_hi - r, tile_hi - r)):
        inside_corner_box = (
            (x < tile_lo + r or x >= tile_hi - r)
            and (y < tile_lo + r or y >= tile_hi - r)
        )
        if inside_corner_box:
            if abs(x - ox) <= r and abs(y - oy) <= r:
                if (x - ox) ** 2 + (y - oy) ** 2 <= r * r:
                    return True
            # fall through to other corners
    if (tile_lo + r <= x < tile_hi - r) or (tile_lo + r <= y < tile_hi - r):
        return True
    return False


def is_c(x, y):
    dx, dy = x - cx, y - cy
    d2 = dx * dx + dy * dy
    if not (c_inner * c_inner <= d2 <= c_outer * c_outer):
        return False
    # Open the right side to form a 'C' (cut a wedge facing right).
    if dx > 0 and abs(dy) < 150:
        return False
    return True


rows = bytearray()
for y in range(S):
    rows.append(0)  # filter byte 0 (None) per scanline
    for x in range(S):
        if in_rounded(x, y):
            px = FG if is_c(x, y) else TILE
        else:
            px = BG
        rows += bytes(px)


def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", S, S, 8, 6, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
png += chunk(b"IEND", b"")

with open("icon-source.png", "wb") as f:
    f.write(png)
print(f"wrote icon-source.png ({len(png)} bytes)")
