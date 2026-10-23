import { expect, test } from 'bun:test';
import { renderPixelRatio } from '../../src/engine/gfx/RenderResolution';
import { GraphicsOptions } from '../../src/gui/screen/options/GraphicsOptions';
import { CanvasMetrics } from '../../src/gui/CanvasMetrics';
import { MapScrollHandler } from '../../src/gui/screen/game/worldInteraction/MapScrollHandler';

test('render targets reach 4K without exceeding aspect, hardware or output limits', () => {
    expect(renderPixelRatio(1920, 1080, '4k', 1)).toBe(2);
    expect(renderPixelRatio(1280, 720, '4k', 1)).toBe(3);
    expect(renderPixelRatio(1280, 960, '4k', 2)).toBe(2.25);
    expect(renderPixelRatio(1920, 1080, '720p', 2)).toBeCloseTo(2 / 3);
    expect(renderPixelRatio(1920, 1080, 'native', 3)).toBeCloseTo(Math.sqrt(16777216 / (1920 * 1080)));
    expect(renderPixelRatio(1920, 1080, 'original', 2)).toBe(1);
    expect(renderPixelRatio(1920, 1080, '4k', 2, 2048, 2048)).toBeCloseTo(2048 / 1920);
    expect(renderPixelRatio(5120, 2880, 'native', 2)).toBeCloseTo(Math.sqrt(16777216 / (5120 * 2880)));
});

test('graphics settings preserve old viewport preferences and persist sampling separately', () => {
    const options = new GraphicsOptions().unserialize('0,0,1280x960');
    expect(options.resolution.value).toEqual({ width: 1280, height: 960 });
    expect(options.renderResolution.value).toBe('native');
    options.renderResolution.value = '4k';
    const copy = new GraphicsOptions().unserialize(options.serialize());
    expect(copy.renderResolution.value).toBe('4k');
    expect(copy.resolution.value).toEqual(options.resolution.value);
    copy.unserialize('0,0,,invalid');
    expect(copy.renderResolution.value).toBe('native');
});

test('4K buffer and CSS scaling preserve click coordinates and all scroll edges', () => {
    const canvas = { width: 3840, height: 2160, dataset: { logicalWidth: '1920', logicalHeight: '1080' },
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 960, height: 540 }) };
    const win = { scrollX: 0, scrollY: 0, addEventListener() {}, removeEventListener() {} };
    const metrics = new CanvasMetrics(canvas as any, win as any);
    metrics.init();
    expect(metrics.toCanvasPosition(490, 290)).toEqual({ x: 960, y: 540 });
    expect(metrics.toCanvasOffset(240, 135)).toEqual({ x: 480, y: 270 });
    const handler = new MapScrollHandler(canvas as any, {}, {}, {}, {
        onBeforeCameraUpdate: { subscribe() {}, unsubscribe() {} },
    });
    for (const [x, y, expected] of [[0, 540, [-1, 0]], [1919, 540, [1, 0]],
        [960, 0, [0, -1]], [960, 1079, [0, 1]]] as const) {
        handler.update({ x, y });
        expect((handler as any).panDirection.toArray()).toEqual(expected);
    }
    metrics.dispose();
});
