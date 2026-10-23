import { expect, test } from 'bun:test';
import { presentationLayout, displayToPresentation } from '../../src/gui/Presentation';
import { renderOutput } from '../../src/engine/gfx/RenderResolution';
import { WorldScene } from '../../src/engine/renderable/WorldScene';

test('reference presentation scales uniformly and preserves vertical world span after HUD', () => {
    for (const [w, h] of [[1600, 900], [1920, 1080], [2560, 1440], [3840, 2160], [1280, 800], [800, 600]]) {
        const p = presentationLayout(w, h);
        expect(p.height).toBe(900);
        expect(p.width / p.height).toBeCloseTo(w / h);
        expect(p.width * p.scale!).toBeCloseTo(w);
        const camera = WorldScene.createCamera({ width: p.width - 168, height: p.height - 32 });
        const baseline = WorldScene.createCamera({ width: 1432, height: 868 });
        expect(camera.top).toBe(baseline.top);
        expect(camera.bottom).toBe(baseline.bottom);
        expect(camera.rotation.toArray()).toEqual(baseline.rotation.toArray());
        expect(displayToPresentation(w / 2, h / 2, p.width, p.height, w, h)).toEqual({ x: p.width / 2, y: 450 });
        expect(displayToPresentation(12, -6, p.width, p.height, w, h).x).toBeCloseTo(12 / p.scale!);
    }
    expect(presentationLayout(1600, 1000).width).toBe(1440);
});

test('native output follows measured backing density once and admits both Retina sizes', () => {
    for (const [w, h, dpr] of [[1920, 1080, 1], [2048, 1152, 1.25], [2560, 1440, 1.5],
        [1920, 1080, 2], [1512, 982, 2], [1728, 1117, 2]]) {
        const output = renderOutput(w, h, 'native', dpr);
        expect(output.effective).toEqual([w * dpr, h * dpr]);
        expect(output.caps).toEqual([]);
    }
    expect(renderOutput(1600, 1000, '4k', 2).effective).toEqual([3456, 2160]);
    expect(renderOutput(2000, 1000, '4k', 2).effective).toEqual([4320, 2160]);
});

test('invalid settings fall back; GPU side and allocation caps remain explicit', () => {
    expect(renderOutput(1600, 900, 'invalid' as any, 1.5).effective).toEqual([2400, 1350]);
    expect(renderOutput(1600, 900, 'native', NaN).effective).toEqual([1600, 900]);
    const output = renderOutput(7680, 4320, 'native', 2, 4096, 4096);
    expect(output.requested).toEqual([15360, 8640]);
    expect(output.effective[0]).toBeLessThanOrEqual(4096);
    expect(output.effective[0] * output.effective[1]).toBeLessThanOrEqual(16777216);
    expect(output.caps.length).toBeGreaterThan(0);
    expect(renderOutput(0, NaN, 'native', 1).effective).toEqual([1, 1]);
});
