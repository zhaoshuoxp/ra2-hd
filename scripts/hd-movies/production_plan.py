"""Bounded temporal windows and same-frame overlap weights; cuts never share context."""
import math

def windows(frames, cuts=(), length=40, overlap=10):
    assert frames > 0 and length >= 2 and 0 < overlap < length
    boundaries = [0, *sorted(set(cuts)), frames]
    assert all(0 < point < frames for point in boundaries[1:-1])
    result = []
    for shot, (first, last) in enumerate(zip(boundaries, boundaries[1:])):
        starts = [first] if last - first <= length else list(range(first, last - length + 1, length - overlap))
        if starts[-1] + length < last:
            starts.append(last - length)
        for index, start in enumerate(starts):
            end = min(last, start + length)
            result.append(dict(shot=shot, start=start, end=end,
                               leftOverlap=min(last, starts[index - 1] + length) - start if index else 0,
                               rightOverlap=end - starts[index + 1] if index + 1 < len(starts) else 0,
                               flushEnd=starts[index + 1] if index + 1 < len(starts) else last))
    return result

def weights(window):
    length = window['end'] - window['start']
    result = []
    for index in range(length):
        value = 1.
        if index < window['leftOverlap']:
            value *= math.sin(math.pi * (index + .5) / (2 * window['leftOverlap'])) ** 2
        if length - index <= window['rightOverlap']:
            value *= math.sin(math.pi * (length - index - .5) / (2 * window['rightOverlap'])) ** 2
        result.append(value)
    return result
