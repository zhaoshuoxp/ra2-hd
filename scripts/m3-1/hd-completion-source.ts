import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { retailMember } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';

const base = path.resolve(process.argv[2]), output = path.join(base, 'source');
fs.mkdirSync(output, { recursive: false }); fs.mkdirSync(path.join(output, 'native'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const rules = new IniFile(retailMember('ra2', 'rules.ini').file);
rules.mergeWith(new IniFile(fs.readFileSync('.local/campaign/ra2/sov01t/sov01t.map', 'utf8')));
const art = new IniFile(retailMember('ra2', 'art.ini').file), sources: any[] = [];
const save = (name: string, bytes: Uint8Array) => fs.writeFileSync(path.join(output, 'native', name), bytes, { flag: 'wx' });
const palette = (name: string) => {
    const found = retailMember('ra2', name), bytes = found.file.getBytes();
    const filename = path.join(output, 'native', name);
    if (!fs.existsSync(filename)) save(name, bytes);
    return { identity: { member: name, archive: found.source, sha256: found.sha256, bytes: bytes.length }, colors: new Palette(found.file) };
};
for (const [id, name, kind] of [
    ['CAWA2A', 'cuwa2a.shp', 'building'], ['CAWA2B', 'cuwa2b.shp', 'building'],
    ['BRIDGEB1', 'bridgb.urb', 'overlay'], ['CRUISE', 'cruise.vxl', 'vehicle'],
    ['TUG', 'tug.vxl', 'vehicle'], ['PDPLANE', 'pdplane.vxl', 'aircraft'],
]) {
    const found = retailMember('ra2', name), bytes = found.file.getBytes(), section = rules.getSection(id)!;
    assert(section); save(name, bytes);
    const source: any = { identity: id, member: name, sha256: found.sha256, archive: found.source,
        nativeFile: name, bindings: [{ id, kind, role: 'body' }], nativeRules: Object.fromEntries(section.entries),
        nativeArt: Object.fromEntries(art.getSection(id)?.entries ?? []), hasShadow: true, remapable: kind !== 'overlay' };
    source.bindings[0].nativeArt = source.nativeArt;
    const pal = palette(kind === 'overlay' ? 'isourb.pal' : 'uniturb.pal'); source.palette = pal.identity;
    if (name.endsWith('.vxl')) {
        const hva = retailMember('ra2', name.replace('.vxl', '.hva'));
        save(name.replace('.vxl', '.hva'), hva.file.getBytes());
        source.hva = { member: name.replace('.vxl', '.hva'), archive: hva.source, sha256: hva.sha256 };
        source.format = 'vxl'; source.vpl = { member: 'voxels.vpl', sha256: retailMember('ra2', 'voxels.vpl').sha256 };
    } else {
        const shp = new ShpFile(found.file); source.format = 'shp'; source.canvas = [shp.width, shp.height];
        source.totalFrames = shp.numImages; source.bodyFrames = shp.numImages / 2;
        if (kind === 'building') source.framePalettes = { 3: { ...palette('isourb.pal').identity, role: 'rubble', runtimeUsed: true, remapable: false } };
        source.frames = shp.images.map((frame, slot) => {
            const colors = kind === 'building' && slot === 3 ? palette('isourb.pal').colors : pal.colors;
            const rgba = new Uint8Array(frame.width * frame.height * 4);
            frame.imageData.forEach((index, pixel) => {
                const c = colors.getColor(index); rgba.set([c.r, c.g, c.b, index ? 255 : 0], pixel * 4);
            });
            const stem = name + '-' + slot, indexFile = stem + '.index', file = stem + '.rgba';
            save(indexFile, frame.imageData); save(file, rgba);
            if (frame.width && frame.height) fs.writeFileSync(path.join(output, 'native', stem + '.png'),
                PNG.sync.write({ width: frame.width, height: frame.height, data: Buffer.from(rgba) } as any));
            return { slot, origin: [frame.x, frame.y], size: [frame.width, frame.height], file, indexFile,
                png: stem + '.png', empty: !frame.imageData.some(Boolean), indexSha256: sha(frame.imageData), rgbaSha256: sha(rgba) };
        });
    }
    sources.push(source);
}
save('voxels.vpl', retailMember('ra2', 'voxels.vpl').file.getBytes());
const result = { schema: 'm2-2-native-export-input-v1', theater: 'URBAN', sources,
    missionSha256: sha(fs.readFileSync('.local/campaign/ra2/sov01t/sov01t.map')),
    acceptance: 'Original source guides only; no authored-art or runtime-completion claim.' };
fs.writeFileSync(path.join(output, 'source.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(sources.map(s => ({ identity: s.identity, member: s.member, frames: s.bodyFrames ?? null, sha256: s.sha256 }))));
