"""Fit complete native frame sets within the existing SHP page limits."""
import math


def estimate(rectangles, width):
    x, y, row, used_height, pages, pixels = 2, 2, 0, 4, 0, 0
    for rw, rh in rectangles:
        if rw + 4 > width or rh + 4 > 2048:
            return None
        if x + rw + 2 > width:
            x, y, row = 2, y + row + 4, 0
        if y + rh + 2 > 2048:
            pages += 1
            pixels += width * used_height
            x, y, row, used_height = 2, 2, 0, 4
        used_height = max(used_height, y + rh + 2)
        x += rw + 4
        row = max(row, rh)
    return pages + 1, pixels + width * used_height


def page_width(frames, slots, density):
    rectangles = [tuple(n * density for n in frames[slot['slot']]['legacyRenderSize'])
                  for slot in slots if slot['status'] != 'EXACT_NATIVE_DUPLICATE']
    minimum = math.ceil(max(256, max(width + 4 for width, _ in rectangles)) / 64) * 64
    assert minimum <= 2048, 'Native frame exceeds existing 2048-pixel page width'
    initial = estimate(rectangles, minimum)
    assert initial is not None, 'Native frame exceeds existing 2048-pixel page limit'
    if initial[0] <= 8:
        return minimum
    candidates = [(result[1], result[0], width) for width in range(minimum, 2049, 64)
                  if (result := estimate(rectangles, width)) is not None and result[0] <= 8]
    assert candidates, 'Complete native frame set cannot fit existing eight-page limit'
    return min(candidates)[2]
