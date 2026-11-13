import { expect, test } from 'bun:test';
import { campaignWorldRegistration, paintCampaignBackdrop } from '../../src/gui/campaign/CampaignBackdrop';
import { readCampaignWorldBackdrop } from '../../src/gui/campaign/CampaignWorldBackdrop';
import { retailMember } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';

const declaration = { schema: 'campaign-world-backdrop-v1', file: 'interface-world-v42-r1.png',
    width: 1915, height: 821, scale: .6277777473493853,
    sourceLocator: [1011.6371744889243, 197.0707846196585], nativeLocator: [261.5, 161],
    gridOrigin: [71, 203], gridStep: [163, 263], gridInk: '#0c004c' };

test('source-specific world registration centers the original European locator proportionally at every aspect ratio', () => {
    const world = readCampaignWorldBackdrop(declaration);
    for (const [width, height] of [[800, 520], [1066.67, 600], [1400, 600], [800, 1000], [2400, 600]]) {
        const map = campaignWorldRegistration(width, height, world);
        expect(map.x + world.sourceLocator[0] * map.scale).toBeCloseTo((width - 800) / 2 + 261.5, 8);
        expect(map.y + world.sourceLocator[1] * map.scale).toBeCloseTo((height - 520) / 2 + 161, 8);
        expect(map.width / map.sourceWidth).toBeCloseTo(map.height / 821, 8);
        expect(Math.abs(map.x + 520 * map.scale - map.locatorX)).toBeGreaterThan(250);
        const original = campaignWorldRegistration(width, height);
        expect(original.x + 520 * original.scale).toBeCloseTo((width - 800) / 2 + 264, 8);
        expect(original.y + 248 * original.scale).toBeCloseTo((height - 520) / 2 + 160, 8);
    }
});

test('source grid remains registered to the native plane without a duplicate or distorted world', () => {
    const world = readCampaignWorldBackdrop(declaration), draws: unknown[][] = [], lines: number[][] = [];
    const context = { fillRect() {}, beginPath() {}, stroke() {},
        moveTo: (...args: number[]) => lines.push(args), lineTo() {},
        drawImage: (...args: unknown[]) => draws.push(args) } as unknown as CanvasRenderingContext2D;
    paintCampaignBackdrop(context, { image: {} as HTMLImageElement,
        revision: world.file, world, dispose() {} }, 800, 520);
    expect(draws).toHaveLength(2);
    expect(draws.reduce((sum, draw) => sum + Number(draw[3]), 0)).toBeCloseTo(1760, 8);
    expect(lines.filter(([x, y]) => y === 0).map(([x]) => x)).toEqual([71, 234, 397, 560, 723]);
    expect(lines.filter(([x, y]) => x === 0).map(([, y]) => y)).toEqual([203, 466]);
    expect(context.strokeStyle).toBe('#0c004c');
});

test('source-world arcs cover the right edge without stretching or repeating the planet', () => {
    const world = readCampaignWorldBackdrop(declaration);
    for (const [width, height] of [[800, 520], [960, 600], [1066.67, 600], [1400, 600], [2400, 600], [800, 1000]]) {
        const draws: number[][] = [];
        const context = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
            drawImage: (_image: unknown, ...args: number[]) => draws.push(args) } as unknown as CanvasRenderingContext2D;
        paintCampaignBackdrop(context, { image: {} as HTMLImageElement, revision: world.file, world, dispose() {} }, width, height);
        expect(draws.length).toBeGreaterThan(0); expect(draws.length).toBeLessThanOrEqual(2);
        const ordered = [...draws].sort((a, b) => a[0] - b[0]);
        expect(ordered[0][0]).toBeCloseTo(155, 8);
        expect(ordered.at(-1)![0] + ordered.at(-1)![2]).toBeCloseTo(1915, 8);
        if (ordered.length === 2) expect(ordered[0][0] + ordered[0][2]).toBeCloseTo(ordered[1][0], 8);
        expect(draws.reduce((sum, draw) => sum + draw[2], 0)).toBeCloseTo(1760, 8);
        for (const [sx, sy, sw, sh, dx, dy, dw, dh] of draws) {
            expect([sy, sh]).toEqual([0, 821]);
            expect(dw / sw).toBeCloseTo(world.scale, 8); expect(dh / sh).toBeCloseTo(world.scale, 8);
            if (world.sourceLocator[0] >= sx && world.sourceLocator[0] < sx + sw) {
                expect(dx + (world.sourceLocator[0] - sx) * world.scale).toBeCloseTo((width - 800) / 2 + 261.5, 8);
                expect(dy + world.sourceLocator[1] * world.scale).toBeCloseTo((height - 520) / 2 + 161, 8);
            }
        }
        const first = Math.min(...draws.map(draw => draw[4])), last = Math.max(...draws.map(draw => draw[4] + draw[6]));
        expect(last - first).toBeCloseTo(1760 * world.scale, 8);
        if (width <= 1760 * world.scale) { expect(first).toBeLessThanOrEqual(0); expect(last).toBeGreaterThanOrEqual(width); }
    }
});

test('the two independent source grid spacings agree with the actual original Allied05 loading image', () => {
    const source = new ShpFile(retailMember('ra2', 'ls800a05.shp').file).images[0];
    const palette = new Palette(retailMember('ra2', 'ldscrna.pal').file);
    const pixel = (x: number, y: number) => palette.getColor(source.imageData[(y - source.y) * source.width + x - source.x]);
    for (const x of [71, 234, 397, 560, 723]) {
        const color = pixel(x, 20); expect(color.b).toBeGreaterThan(64); expect(color.g).toBe(0);
    }
    for (const y of [203, 466]) {
        const color = pixel(100, y); expect(color.b).toBeGreaterThan(64); expect(color.g).toBe(0);
    }
    expect(pixel(100, 40)).toMatchObject({ r: 0, g: 0, b: 0 });
});

test('world metadata rejects foreign files, geometry drift and invalid coordinates before loading', () => {
    const invalid = [null, {}, { ...declaration, file: '../interface-world.png' },
        { ...declaration, file: 'https://example.com/world.png' }, { ...declaration, file: 'interface-world-v42-r1.svg' },
        { ...declaration, width: 4000 }, { ...declaration, height: 820 }, { ...declaration, scale: NaN },
        { ...declaration, scale: Infinity }, { ...declaration, scale: 0 },
        { ...declaration, sourceLocator: [100, 200] },
        { ...declaration, sourceLocator: [1916, 200] }, { ...declaration, nativeLocator: [800, -1] },
        { ...declaration, nativeLocator: [261, 161, 1] }, { ...declaration, gridOrigin: [71, Infinity] },
        { ...declaration, gridStep: 0 }, { ...declaration, gridStep: [163, NaN] },
        { ...declaration, gridStep: [163, 5000] }, { ...declaration, gridInk: 'red' }];
    for (const value of invalid) expect(() => readCampaignWorldBackdrop(value)).toThrow('campaign-world-backdrop-contract');
});
