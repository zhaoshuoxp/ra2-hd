import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { paintCampaignBackdrop } from '../../src/gui/campaign/CampaignBackdrop';
import { scoreForegroundAlpha } from '../../src/gui/campaign/CampaignScoreMatte';
import { retailMember } from '../test-support/resources';

const revision = 'campaign-backdrop-allied-score-original-v50-r1.png';

test('the Allied score backdrop preserves every original archive/palette pixel', () => {
    const sprite = new ShpFile(retailMember('ra2', 'ascrbkmd.shp').file);
    const palette = new Palette(retailMember('ra2', 'ascore.pal').file), frame = sprite.getImage(0);
    const image = PNG.sync.read(readFileSync('public/res/presentation/' + revision));
    expect([image.width, image.height]).toEqual([sprite.width, sprite.height]);
    const expected = Buffer.alloc(image.width * image.height * 4);
    frame.imageData.forEach((index, pixel) => {
        const color = palette.getColor(index), x = pixel % frame.width + frame.x, y = Math.floor(pixel / frame.width) + frame.y;
        expected.set([color.r, color.g, color.b, 255], (y * image.width + x) * 4);
    });
    expect(image.data.equals(expected)).toBe(true);
});

test('both score factions fill narrow and wide layouts while keeping the insignia proportional', () => {
    for (const [width, height] of [[800, 600], [1280, 720], [600, 900], [3840, 2160]]) {
        const record = (file: string) => {
            const draws: number[][] = [];
            const context = { drawImage: (_: unknown, ...args: number[]) => draws.push(args),
                save() {}, restore() {}, translate() {}, scale() {} } as any;
            paintCampaignBackdrop(context, { revision: file, image: { naturalWidth: 632, naturalHeight: 568 },
                inset: 12, dispose() {} } as any, width, height);
            return draws;
        };
        const allied = record(revision), soviet = record('campaign-backdrop-soviet-score-original-r4.png');
        expect(allied).toEqual(soviet);
        const [sourceX, sourceY, sourceWidth, sourceHeight, left, top, drawnWidth, drawnHeight] = allied[0];
        expect([sourceX, sourceY, sourceWidth, sourceHeight, top]).toEqual([12, 12, 608, 544, 0]);
        expect(drawnWidth / drawnHeight).toBeCloseTo(608 / 544, 8);
        expect(drawnHeight).toBe(height);
        expect(left + drawnWidth / 2).toBeCloseTo(width / 2, 8);
        if (left > 0) {
            expect(allied.length).toBe(3);
            expect(allied.slice(1).map(draw => [draw[2], draw[6], draw[7]])).toEqual([[16, left, height], [16, left, height]]);
        } else expect(allied.length).toBe(1);
    }
});

test('all Allied opening and emblem frames expose the full backdrop and retain their moving apparatus', () => {
    const panel = new ShpFile(retailMember('ra2', 'ascrtmd.shp').file);
    const emblem = new ShpFile(retailMember('ra2', 'ascramd.shp').file);
    const palette = new Palette(retailMember('ra2', 'ascore.pal').file);
    expect([panel.numImages, emblem.numImages]).toEqual([6, 44]);
    for (const [sprite, kind] of [[panel, 'panel'], [emblem, 'emblem']] as const) {
        const phases = new Set<string>();
        for (let frame = 0; frame < sprite.numImages; frame++) {
            const source = sprite.getImage(frame), alpha = scoreForegroundAlpha(source, panel.getImage(5), palette, kind, frame);
            expect(alpha[200 * source.width]).toBe(0);
            expect(alpha.filter(value => value === 255).length).toBeGreaterThan(kind === 'panel' ? 25000 : 80000);
            phases.add(Buffer.from(alpha).toString('base64'));
        }
        expect(phases.size).toBeGreaterThan(1);
    }
});
