import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { retailIni, retailMember, sha256 } from '../test-support/resources';

const edition = process.argv.find(value => value.startsWith('--edition='))?.split('=')[1] ?? 'ra2';
const animation = process.argv.find(value => value.startsWith('--animation='))?.split('=')[1];
const destruction = process.argv.find(value => value.startsWith('--destroy-animation='))?.split('=')[1];
assert(!(animation && destruction), 'Select one verified original animation role');
const selectedAnimation = animation ?? destruction;
assert(edition === 'ra2' || edition === 'yr');
const [directory, mission, ...requests] = process.argv.slice(2).filter(value => !value.startsWith('--'));
assert(directory && /^[a-z0-9]+\.map$/.test(mission) && requests.length);
assert(!selectedAnimation || requests.length === 1, 'An animation export identifies one parent binding');
const base = path.resolve(directory), native = path.join(base, 'native');
mkdirSync(base, { recursive: false }); mkdirSync(native);
const map = readFileSync(path.join('.local/campaign', edition, mission.slice(0, -4), mission));
const mapIni = new IniFile(map.toString()), theater = mapIni.getSection('Map')!.getString('Theater').toUpperCase();
const paletteSuffix = { TEMPERATE: 'tem', SNOW: 'sno', URBAN: 'urb', NEWURBAN: 'ubn', DESERT: 'des', LUNAR: 'lun' }[theater];
assert(paletteSuffix, 'Unsupported original campaign theater');
const rules = retailIni(edition); rules.mergeWith(mapIni);
const art = retailIni(edition, 'art'), sources: any[] = [], saved = new Set<string>();
const exportMember = (name: string) => {
    const item = retailMember(edition, name), bytes = item.file.getBytes();
    if (!saved.has(name)) { writeFileSync(path.join(native, name), bytes, { flag: 'wx' }); saved.add(name); }
    return item;
};
const palette = (name: string) => {
    const item = exportMember(name);
    return { identity: { member: name, sha256: item.sha256, archive: item.source, bytes: item.file.getSize() }, colors: new Palette(item.file) };
};
for (const request of requests) {
    const [identity, member, ...additionalMembers] = request.split(':'); assert(identity && member && rules.getSection(identity));
    const terrain = [...(rules.getSection('TerrainTypes')?.entries.values() ?? [])].includes(identity);
    const building = [...(rules.getSection('BuildingTypes')?.entries.values() ?? [])].includes(identity);
    const smudge = [...(rules.getSection('SmudgeTypes')?.entries.values() ?? [])].includes(identity);
    const nativeRules = rules.getSection(identity)!, artIdentity = nativeRules.getString('Image', identity);
    const parentArt = art.getSection(artIdentity) ?? art.getSection(identity);
    if (animation) assert(building && parentArt?.getString('ActiveAnim') === animation, 'Unverified parent animation');
    if (destruction) assert(building && nativeRules.getArray('DestroyAnim').includes(destruction), 'Unverified original destruction animation');
    const nativeArt = selectedAnimation ? art.getSection(selectedAnimation) : parentArt;
    assert(nativeArt, 'Missing original art section');
    const damagedNativeArt = animation && art.getSection(parentArt!.getString('ActiveAnimDamaged'));
    const iso = terrain || smudge || nativeRules.getBool('NoUseTileLandType', false)
        || nativeArt?.getBool('TerrainPalette', false) || nativeArt?.getBool('ShouldUseCellDrawer', false);
    const item = exportMember(member), pal = palette(`${iso ? 'iso' : 'unit'}${paletteSuffix}.pal`);
    const source: any = { identity: destruction ?? identity, member, sha256: item.sha256, archive: item.source, palette: pal.identity,
        nativeRules: Object.fromEntries((destruction ? rules.getSection(destruction) : nativeRules)?.entries ?? []), artIdentity: selectedAnimation ?? artIdentity,
        nativeArt: Object.fromEntries(nativeArt.entries),
        ...(destruction ? { bindingRole: 'DESTROY_ANIMATION', parentRulesIdentity: identity,
            parentRules: Object.fromEntries(nativeRules.entries), parentArtIdentity: artIdentity } : {}),
        ...(animation ? { bindingRole: 'ACTIVE', parentArtIdentity: artIdentity,
            damagedNativeArt: damagedNativeArt && Object.fromEntries(damagedNativeArt.entries) } : {}) };
    if (member.endsWith('.vxl')) {
        const hva = exportMember(member.replace('.vxl', '.hva')), vpl = exportMember('voxels.vpl');
        Object.assign(source, { format: 'vxl', hva: { member: member.replace('.vxl', '.hva'), sha256: hva.sha256, archive: hva.source },
            vpl: { member: 'voxels.vpl', sha256: vpl.sha256 } });
        source.additionalMembers = additionalMembers;
        source.additionalSources = additionalMembers.map(member => {
            const extra = exportMember(member), hva = exportMember(member.replace('.vxl', '.hva'));
            return { member, sha256: extra.sha256, archive: extra.source,
                hva: { member: member.replace('.vxl', '.hva'), sha256: hva.sha256, archive: hva.source } };
        });
    } else {
        const shp = new ShpFile(item.file), rubble = palette(`iso${paletteSuffix}.pal`);
        // Building always applies its house palette, including civilian garrison
        // frames whose Art entry says Remapable=no. Rubble keeps its Iso palette.
        const remapable = !destruction && building || (nativeArt?.getBool('Remapable', false) ?? false);
        const hasShadow = selectedAnimation ? nativeArt.getBool('Shadow', false) : true;
        Object.assign(source, { format: 'shp', canvas: [shp.width, shp.height], totalFrames: shp.numImages,
            bodyFrames: shp.numImages / (hasShadow ? 2 : 1), hasShadow, remapable,
            framePalettes: !selectedAnimation && building && !iso && shp.numImages / 2 === 4
                ? { 3: { ...rubble.identity, remapable: false, role: 'rubble',
                    runtimeUsed: nativeRules.getBool('LeaveRubble', false) } } : {} });
        source.frames = shp.images.map((frame, slot) => {
            const rgba = Buffer.alloc(frame.width * frame.height * 4), colors = !selectedAnimation && building && !iso
                && shp.numImages / 2 === 4 && slot === 3 ? rubble.colors : pal.colors;
            frame.imageData.forEach((index, pixel) => { const color = colors.getColor(index);
                rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel * 4); });
            const stem = `${member}-${slot}`;
            writeFileSync(path.join(native, stem + '.index'), frame.imageData, { flag: 'wx' });
            if (frame.width && frame.height) writeFileSync(path.join(native, stem + '.png'),
                PNG.sync.write({ width: frame.width, height: frame.height, data: rgba } as any), { flag: 'wx' });
            return { slot, origin: [frame.x, frame.y], size: [frame.width, frame.height], png: stem + '.png',
                empty: !frame.imageData.some(Boolean), indexSha256: sha256(frame.imageData) };
        });
    }
    sources.push(source);
}
writeFileSync(path.join(base, 'source.json'), JSON.stringify({ schema: 'original-campaign-art-source-v1',
    edition, mission, missionSha256: sha256(map), theater, sources,
    scope: 'Unchanged original guides and source identities only; no authored-HD or gameplay acceptance.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(sources.map(source => ({ identity: source.identity, member: source.member, sha256: source.sha256 }))));
