import { expect, test } from 'bun:test';
import { GraphicsOptions } from '../../../src/gui/screen/options/GraphicsOptions';
import { hdTextureBudget } from '../../../src/engine/gfx/HdDensity';
import { requestedHdDensity } from '../../../src/engine/renderable/builder/hdOrigin';
import { downsampleHdPage, downsampleMask } from '../../../src/engine/renderable/builder/downsampleHdPage';

test('old saves default to 4x while explicit 2x survives reload independently of HD and output size', () => {
    const graphics = new GraphicsOptions().unserialize('1,2,1920x1080,4k,1');
    expect(graphics.hdDensity.value).toBe(4);
    graphics.hdDensity.value = 2; graphics.hdEnabled.value = false;
    const restored = new GraphicsOptions().unserialize(graphics.serialize());
    expect(restored.hdDensity.value).toBe(2);
    expect(restored.hdEnabled.value).toBe(false);
    expect(restored.renderResolution.value).toBe('4k');
    expect(restored.resolution.value).toEqual({ width: 1920, height: 1080 });
    expect(new GraphicsOptions().unserialize(graphics.serialize().replace(/,2$/, ',invalid')).hdDensity.value).toBe(4);
    expect(hdTextureBudget(2)).toBe(512 * 1024 * 1024);
    expect(hdTextureBudget(4)).toBe(1280 * 1024 * 1024);
    expect(requestedHdDensity(true, 'unit-hd', 'ra2://game/', 2)).toBe(2);
    expect(requestedHdDensity(false, 'unit-hd', 'ra2://game/', 2)).toBeUndefined();
    expect(requestedHdDensity(true, 'unit-hd', 'https://example.com/', 2)).toBeUndefined();
});

test('2x reduction excludes transparent matte colors and keeps palette data valid', () => {
    const base = { width: 2, height: 2, rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0]) };
    const data = { width: 2, height: 2, rgba: new Uint8Array([255, 9, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]) };
    const [color, remap] = downsampleHdPage(base, data);
    expect([...color.rgba]).toEqual([255, 0, 0, 64]);
    expect([...remap.rgba]).toEqual([255, 9, 0, 255]);
    expect(base.rgba.length).toBe(16);
    expect([...downsampleMask(new Uint8Array([255, 0, 0, 0]), 2, 2)]).toEqual([64]);
    expect(() => downsampleMask(new Uint8Array(1), 2, 2)).toThrow('size');
});

test('2x colors average in linear light and zero alpha cannot retain remap coverage', () => {
    const base = { width: 2, height: 2, rgba: new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255,
        255, 255, 255, 255, 0, 0, 0, 255]) };
    const data = { width: 2, height: 2, rgba: new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]) };
    expect([...downsampleHdPage(base, data)[0].rgba]).toEqual([188, 188, 188, 255]);
    base.rgba.fill(0);
    expect([...downsampleHdPage(base, data)[1].rgba]).toEqual([0, 0, 0, 255]);
});
