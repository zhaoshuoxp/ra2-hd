// Read only the existing isolated import; retain decoded retail art in ignored evidence.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../../src/offline/retail';
import { ShpFile } from '../../../src/data/ShpFile';
import { Palette } from '../../../src/data/Palette';
import { IniFile } from '../../../src/data/IniFile';
import { ImageFinder } from '../../../src/engine/ImageFinder';
import { BuildingAnimArtProps } from '../../../src/engine/renderable/entity/building/BuildingAnimArtProps';
import { BuildingShpHelper } from '../../../src/engine/renderable/entity/building/BuildingShpHelper';
import { ShpAggregator } from '../../../src/engine/renderable/builder/ShpAggregator';
import { AnimProps } from '../../../src/engine/AnimProps';
import { AnimationType } from '../../../src/engine/renderable/entity/building/AnimationType';
const out = '.artifacts/m1-6a/source-v1';
if (existsSync(out))
    throw new Error('Refuse to overwrite source evidence');
mkdirSync(out, { recursive: true });
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name => [name, readFileSync(`.local/assets/ra2/${name}`)])));
const art = new IniFile(resolveMember(tree, 'art.ini').file.readAsString());
const rules = new IniFile(resolveMember(tree, 'rules.ini').file.readAsString());
const palette = new Palette(resolveMember(tree, 'unittem.pal').file);
const config = art.getSection('NAPOWR')!;
const names = new Set(['NAPOWR']);
for (const [key, value] of config.entries) {
    if (/^(ActiveAnim|IdleAnim|SuperAnim|SpecialAnim|ProductionAnim|Buildup)/.test(key)
        && typeof value === 'string' && art.getSection(value)) {
        names.add(art.getSection(value)!.getString('Image') || value);
    }
}
names.add(config.getString('Buildup'));
const images = new Map<string, ShpFile>();
for (const name of names) {
    for (const variant of [name, name[0] + 'T' + name.slice(2), name[0] + 'G' + name.slice(2)]) {
        const member = variant.toLowerCase() + '.shp';
        try {
            images.set(member, new ShpFile(resolveMember(tree, member).file));
        }
        catch { }
    }
}
const finder = new ImageFinder(images, { settings: { extension: '.tem', newTheaterChar: 'T' } });
const anims = new BuildingAnimArtProps();
anims.read(config, {
    hasObject: (name: string) => !!art.getSection(name),
    getObject: (name: string) => ({ art: art.getSection(name) }),
});
const helper = new BuildingShpHelper(finder);
const animationFiles = helper.collectAnimShpFiles(anims as any, { useTheaterExtension: false });
const main = finder.find('NAPOWR', false);
const infos = helper.getShpFrameInfos({ hasShadow: true }, main, undefined, animationFiles);
const aggregate = new ShpAggregator().aggregate([...infos.values()], 'agg_NAPOWR.shp');
const members = [...infos.values()].map(({ file, hasShadow, frameCount }) => {
    const member = resolveMember(tree, file.filename);
    const raw = {
        source: { kind: 'resolved-shp-member', member: file.filename, theater: 'TEMPERATE',
            sha256: createHash('sha256').update(member.file.getBytes()).digest('hex') },
        archive: member.source, canvas: [file.width, file.height], hasShadow, visibleFrames: frameCount,
        aggregateOffset: aggregate.imageIndexes.get(file),
        palette: palette.colors.map(c => [c.r, c.g, c.b]),
        frames: file.images.map((f, nativeFrame) => ({ nativeFrame, x: f.x, y: f.y,
            width: f.width, height: f.height, empty: !f.imageData.some(Boolean), pixels: Array.from(f.imageData) })),
    };
    writeFileSync(`${out}/${file.filename}.json`, JSON.stringify(raw));
    return { ...raw, palette: undefined, frames: raw.frames.map(({ pixels, ...frame }) => frame) };
});
const animations = [...anims.getAll()].flatMap(([type, entries]) => entries.map(entry => {
    const file = animationFiles.get(entry);
    return { type: AnimationType[type], name: entry.name, member: file.filename, offset: entry.offset,
        flat: entry.flat, art: Object.fromEntries(entry.art.entries), damagedArt: entry.damagedArt && Object.fromEntries(entry.damagedArt.entries), normal: new AnimProps(entry.art, file),
        damaged: entry.damagedArt && new AnimProps(entry.damagedArt, file) };
}));
const inventory = { baseline: 'da3a782', rulesIdentity: 'NAPOWR', palette: { member: 'unittem.pal', remapIndices: [16, 31] }, members, aggregateFrames: aggregate.file.numImages, animations,
    art: Object.fromEntries(config.entries), rules: Object.fromEntries(rules.getSection('NAPOWR')!.entries),
    rawLookupTrap: { member: 'napowr.shp', archive: resolveMember(tree, 'napowr.shp').source } };
writeFileSync(`${out}/inventory.json`, JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify({ members: members.map(m => ({ ...m, frames: undefined })), animations }, null, 2));
