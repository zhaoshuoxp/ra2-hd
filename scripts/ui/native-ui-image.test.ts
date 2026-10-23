import { expect, test } from 'bun:test';
import { sampleNativeUi } from '../../src/gui/NativeUiImage';

test('retail UI sampling preserves solid palette colors and the original logical extent', () => {
    const source = new Uint8Array([24, 212, 52, 255, 24, 212, 52, 255]);
    const result = sampleNativeUi(source, 2, 1);
    expect(result.length).toBe(8 * 4 * 4);
    for (let i = 0; i < result.length; i += 4) expect([...result.slice(i, i + 4)]).toEqual([24, 212, 52, 255]);
});

test('retail UI sampling retains one-pixel markers and discards invisible background color', () => {
    const source = new Uint8Array(3 * 3 * 4);
    for (let i = 0; i < source.length; i += 4) source.set([255, 20, 130, 0], i);
    source.set([252, 0, 0, 255], (1 * 3 + 1) * 4);
    const result = sampleNativeUi(source, 3, 3);
    expect([...result.slice((5 * 12 + 5) * 4, (5 * 12 + 5) * 4 + 4)]).toEqual([252, 0, 0, 255]);
    for (let i = 0; i < result.length; i += 4) {
        if (result[i + 3]) expect([...result.slice(i, i + 3)]).toEqual([252, 0, 0]);
        else expect([...result.slice(i, i + 4)]).toEqual([0, 0, 0, 0]);
    }
});

test('curved outlines have continuous subpixel coverage instead of four-level pixel corners', () => {
    const size = 21, source = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (Math.hypot(x - 10, y - 10) < 8.3) source.set([252, 0, 0, 255], (y * size + x) * 4);
    }
    const result = sampleNativeUi(source, size, size);
    const levels = new Set(Array.from(result).filter((_, i) => i % 4 === 3));
    expect(levels.size).toBeGreaterThanOrEqual(12);
    const center = (40 * size * 4 + 40) * 4;
    expect([...result.slice(center, center + 4)]).toEqual([252, 0, 0, 255]);
});

test('adjacent palette regions remain opaque without seams or transparent reconstruction holes', () => {
    const size = 12, source = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        source.set(x < 6 ? [252, 0, 0, 255] : [0, 252, 0, 255], (y * size + x) * 4);
    }
    const result = sampleNativeUi(source, size, size);
    for (let y = 8; y < 40; y++) for (let x = 8; x < 40; x++) {
        const at = (y * 48 + x) * 4;
        expect(result[at + 3]).toBe(255);
        expect(result[at] + result[at + 1]).toBeGreaterThan(200);
        expect(result[at + 2]).toBe(0);
    }
});
