import { resourceRoot } from '../test-support/resources';
import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { matchesNapowrHdSources, napowrHdFamily } from '../../src/engine/renderable/builder/napowrHdFamily';

test('NAPOWR staged family identity rejects snow, urban reuse and incomplete sources', () => {
    const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(n => [n, readFileSync(`${resourceRoot}/assets/ra2/${n}`)])));
    const images = new Map<string, ShpFile>();
    const names = ['ngpowr.shp', 'ngpowr_a.shp', 'ntpowrmk.shp', 'napowr.shp', 'napowr_a.shp', 'napowrmk.shp', 'nupowrmk.shp'];
    names.forEach(n => images.set(n, new ShpFile(resolveMember(tree, n).file)));
    const sources = (theater: string, letter: string) => {
        const finder = new ImageFinder(images, { settings: { extension: '.shp', newTheaterChar: letter } });
        return ['NAPOWR', 'NAPOWR_A', 'NAPOWRMK'].map((name, index) => {
            const image = finder.find(name, false);
            const member = resolveMember(tree, image.filename);
            return { member: image.filename, theater,
                sha256: createHash('sha256').update(member.file.getBytes()).digest('hex'),
                canvas: [image.width, image.height],
                frames: image.images.slice(0, napowrHdFamily.members[index].frames).map((frame, nativeFrame) => ({
                    nativeFrame, trimOrigin: [frame.x, frame.y], trimSize: [frame.width, frame.height],
                    legacyRenderSize: [frame.width + frame.width % 2, frame.height + frame.height % 2],
                    empty: !frame.imageData.some(Boolean),
                })),
            };
        });
    };
    const temperate = sources('TEMPERATE', 'T');
    expect(matchesNapowrHdSources(temperate)).toBe(true);
    expect(matchesNapowrHdSources(sources('SNOW', 'A'))).toBe(false);
    const urban = sources('URBAN', 'U');
    expect(urban[0].sha256).toBe(temperate[0].sha256);
    expect(urban[2].sha256).toBe(temperate[2].sha256);
    expect(matchesNapowrHdSources(urban)).toBe(false);
    expect(matchesNapowrHdSources(temperate.map(s => ({ ...s, theater: 'URBAN' })))).toBe(false);
    expect(matchesNapowrHdSources(temperate.slice(0, 2))).toBe(false);
    expect(matchesNapowrHdSources([temperate[0], temperate[0], temperate[2]])).toBe(false);
    expect(matchesNapowrHdSources(temperate.map(s => ({ ...s, sha256: '0'.repeat(64) })))).toBe(false);
    expect(matchesNapowrHdSources(temperate.map(s => ({ ...s, frames: s.frames.slice(1) })))).toBe(false);
    expect(matchesNapowrHdSources(temperate.map(s => ({ ...s, canvas: [142, 110] })))).toBe(false);
});
