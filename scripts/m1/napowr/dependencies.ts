// Inventory retained shared dependencies from staged archives, never loose files.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../../src/offline/retail';
import { IniFile } from '../../../src/data/IniFile';
import { ShpFile } from '../../../src/data/ShpFile';
import { ImageFinder } from '../../../src/engine/ImageFinder';
import { AnimProps } from '../../../src/engine/AnimProps';
const root = '.artifacts/m1-6a';
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(n => [n, readFileSync(`.local/assets/ra2/${n}`)])));
const ini = (n: string) => new IniFile(resolveMember(tree, n).file.readAsString());
const art = ini('art.ini'), rules = ini('rules.ini');
const config = rules.getSection('NAPOWR')!;
function identity(name: string) {
    const found = resolveMember(tree, name);
    return { member: name, archive: found.source, sha256: createHash('sha256').update(found.file.getBytes()).digest('hex') };
}
const names = new Map<string, string>();
for (const [field, role] of [['Explosion', 'destruction'], ['DebrisAnims', 'debris']])
    for (const name of config.getString(field).split(',').filter(Boolean))
        names.set(name, role);
for (const name of (rules.getSection('AudioVisual')!.getString('DamageFireTypes') || 'FIRE01,FIRE02,FIRE03').split(',').filter(Boolean))
    names.set(name, 'damage-fire');
const particles = config.getString('DamageParticleSystems').split(',').map(name => {
    const section = rules.getSection(name)!;
    const particle = section.getString('HoldsWhat');
    const props = rules.getSection(particle);
    const image = props?.getString('Image');
    if (image)
        names.set(image, 'particle-image');
    return { name, rules: Object.fromEntries(section.entries), particle, particleRules: props && Object.fromEntries(props.entries) };
});
const effects = [...names].map(([name, role]) => {
    const section = art.getSection(name);
    const image = section?.getString('Image') || name;
    const candidates = [image[0] + 'T' + image.slice(2), image[0] + 'G' + image.slice(2), image].map(n => n.toLowerCase() + '.shp');
    const images = new Map();
    for (const file of candidates)
        try {
            images.set(file, new ShpFile(resolveMember(tree, file).file));
        }
        catch { }
    const finder = new ImageFinder(images, { settings: { extension: '.tem', newTheaterChar: 'T' } });
    const shp = finder.tryFind(image, false);
    return { name, role, retainedOriginal: true, art: section && Object.fromEntries(section.entries),
        ...(shp ? { ...identity(shp.filename), canvas: [shp.width, shp.height], frames: shp.numImages, sequence: section && new AnimProps(section, shp) } : { status: 'NO_SHP_RESOLVED' }) };
});
const theaterRows = [];
for (const [theater, letter] of [['TEMPERATE', 'T'], ['SNOW', 'A'], ['URBAN', 'U']]) {
    const images = new Map();
    for (const name of ['NAPOWR', 'NAPOWR_A', 'NAPOWRMK'])
        for (const l of ['A', 'T', 'G', 'U']) {
            const filename = (name[0] + l + name.slice(2)).toLowerCase() + '.shp';
            try {
                images.set(filename, new ShpFile(resolveMember(tree, filename).file));
            }
            catch { }
        }
    const finder = new ImageFinder(images, { settings: { extension: '.shp', newTheaterChar: letter } });
    theaterRows.push({ theater, policy: theater === 'TEMPERATE' ? 'candidate-after-approval' : 'entirely-original',
        members: ['NAPOWR', 'NAPOWR_A', 'NAPOWRMK'].map(name => identity(finder.find(name, false).filename)) });
}
const result = { inputs: ['rules.ini', 'art.ini', 'unittem.pal', 'anim.pal'].map(identity), effects, particles, theaters: theaterRows,
    buildupTime: rules.getSection('General')!.getNumber('BuildupTime'),
    layerContract: { bodyDepthOffset: 0, activityDepthOffset: 1, buildupDepthOffset: 1, damageFireDepthOffset: 3,
        activeAnimZAdjust: -5, activeAnimZAdjustApplied: false, offset: [0, 0], foundation: [3, 2], bib: null,
        rationale: 'Building.createAnimObject uses enumeration depth offset, not ActiveAnimZAdjust. Existing behavior retained.' } };
writeFileSync(`${root}/dependencies-v2.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ effects: effects.map(e => ({ name: e.name, member: e.member, frames: e.frames, status: e.status })), theaters: theaterRows, buildupTime: result.buildupTime }, null, 2));
