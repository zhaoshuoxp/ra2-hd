// Resolve selected SHP source identities from imported archives, deduplicated by hash.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseMix, resolveMember } from '../../../src/offline/retail';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';
import { ShpFile } from '../../../src/data/ShpFile';
const registered = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const top = new Map(GAME_EDITIONS.yr.archives.map(name => {
    const file = ['yr', 'ra2'].map(e => `.local/assets/${e}/${name}`).find(p => {
        try { readFileSync(p); return true; } catch { return false; }
    });
    if (!file) throw Error('Missing imported archive ' + name);
    return [name, readFileSync(file)] as const;
}));
const trees = ['ra2', 'yr'].map(e => editionRetailTree(top, e as any));
for (const tree of trees) tree.push({ path: 'upstream-support/ra2cd.mix',
    mix: parseMix(readFileSync('.local/upstream-support/ra2cd.mix'), 'ra2cd.mix') });
const sources: Record<string, any> = {};
for (const [route, file] of Object.entries(registered.routes) as [string, string][]) {
    if (!route.startsWith('/local-hd/') || !route.endsWith('/manifest.json')) continue;
    const m = JSON.parse(readFileSync(file, 'utf8'));
    if (!m.variants || sources[m.source.sha256]) continue;
    const source = trees.map(tree => {
        try { return resolveMember(tree, m.source.member); } catch { return undefined; }
    }).find(r => r && createHash('sha256').update(r.file.getBytes()).digest('hex') === m.source.sha256);
    if (!source) throw Error('Unresolved selected SHP source ' + m.source.member);
    const shp = new ShpFile(source.file);
    const frames = m.logical.frames.map((f: any) => {
        const native = shp.getImage(f.nativeFrame);
        let ownerPixels = 0;
        for (const index of native.imageData) if (index >= 16 && index <= 31) ownerPixels++;
        return { frame: f.nativeFrame, ownerPixels, trim: [native.x, native.y, native.width, native.height] };
    });
    sources[m.source.sha256] = { member: m.source.member, archive: source.source, frames,
        remapable: frames.some((f: any) => f.ownerPixels > 0) };
}
writeFileSync(process.argv[3], JSON.stringify({ sources }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ sources: Object.keys(sources).length,
    neutral: Object.values(sources).filter(s => !s.remapable).map(s => s.member) }));
