// One batch source inventory using the real retail lookup and aggregation classes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
const root = process.env.SOVIET_BATCH_ROOT ?? '.artifacts/m1-6b', out = `${root}/source-v1`;
if (existsSync(out))
    throw Error('Source evidence is immutable; choose a new revision');
mkdirSync(out, { recursive: true });
const families = process.argv.slice(2).length ? process.argv.slice(2) : ['NAHAND', 'NAREFN', 'NAWEAP', 'NACNST'];
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(n => [n, readFileSync(`.local/assets/ra2/${n}`)])));
const art = new IniFile(resolveMember(tree, 'art.ini').file.readAsString());
const rules = new IniFile(resolveMember(tree, 'rules.ini').file.readAsString());
const palette = new Palette(resolveMember(tree, 'unittem.pal').file);
const plain = (section: any) => section && Object.fromEntries(section.entries);
const identity = (name: string) => {
    const r = resolveMember(tree, name);
    return { member: name, archive: r.source, sha256: createHash('sha256').update(r.file.getBytes()).digest('hex') };
};
function loadImages(names: Iterable<string>) {
    const images = new Map<string, ShpFile>();
    for (const name of names)
        for (const variant of [name, ...['T', 'G', 'A', 'U'].map(c => name[0] + c + name.slice(2))]) {
            const file = variant.toLowerCase() + '.shp';
            try {
                if (!images.has(file))
                    images.set(file, new ShpFile(resolveMember(tree, file).file));
            }
            catch { }
        }
    return images;
}
const seq = (section: any, file: any) => { const { art: _art, ...props } = new AnimProps(section, file); return props; };
const inventory: any = { baseline: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    inputs: ['rules.ini', 'art.ini', 'unittem.pal', 'anim.pal'].map(identity),
    palette: { member: 'unittem.pal', remapIndices: [16, 31] },
    buildupTime: rules.getSection('General')!.getNumber('BuildupTime'), families: {}, effects: {} };
for (const id of families) {
    const rule = rules.getSection(id)!, config = art.getSection(rule.getString('Image') || id)!;
    const imageName = config.getString('Image') || rule.getString('Image') || id;
    const anims = new BuildingAnimArtProps();
    anims.read(config, { hasObject: (n: string) => !!art.getSection(n), getObject: (n: string) => ({ art: art.getSection(n) }) });
    const bib = config.getString('BibShape'), names = new Set([imageName, ...[...anims.getAll().values()].flat().map(a => a.image), ...(bib ? [bib] : [])]);
    const images = loadImages(names);
    const finder = new ImageFinder(images, { settings: { extension: '.tem', newTheaterChar: 'T' } });
    const useTheaterExtension = config.getBool('Theater', false);
    const helper = new BuildingShpHelper(finder), animationFiles = helper.collectAnimShpFiles(anims as any, { useTheaterExtension });
    const main = finder.find(imageName, useTheaterExtension), bibFile = bib ? finder.find(bib, useTheaterExtension) : undefined;
    const hasShadow = config.getBool('Shadow', true) && !rule.getBool('NoShadow');
    const infos = helper.getShpFrameInfos({ hasShadow }, main, bibFile, animationFiles);
    const aggregate = new ShpAggregator().aggregate([...infos.values()], `agg_${id}.shp`);
    const animations = [...anims.getAll()].flatMap(([type, entries]) => entries.map((entry, i) => {
        const file = animationFiles.get(entry);
        if (!file)
            throw Error(`Unresolved ${id}/${entry.name}`);
        const normal = seq(entry.art, file), damaged = entry.damagedArt && seq(entry.damagedArt, file);
        if (type === AnimationType.BUILDUP || type === AnimationType.UNBUILD)
            normal.rate = normal.frameCount / (60 * inventory.buildupTime);
        return { type: AnimationType[type], typeId: type, name: entry.name, image: entry.image, member: file.filename,
            depthOffset: i + 1, offset: entry.offset, flat: entry.flat, pauseWhenUnpowered: entry.pauseWhenUnpowered,
            showWhenUnpowered: entry.showWhenUnpowered, art: plain(entry.art), damagedArt: plain(entry.damagedArt), normal, damaged };
    }));
    const directory = `${out}/${id}`;
    mkdirSync(directory);
    const members = [...infos.values()].map(({ file, hasShadow, frameCount }) => {
        const roles = [...(file === main ? ['body'] : []), ...(file === bibFile ? ['bib'] : []), ...animations.filter(a => a.member === file.filename).map(a => a.type)];
        const raw = { source: { kind: 'resolved-shp-member', ...identity(file.filename), theater: 'TEMPERATE' },
            canvas: [file.width, file.height], hasShadow, aggregateVisibleFrames: frameCount,
            aggregateOffset: aggregate.imageIndexes.get(file), roles, palette: palette.colors.map(c => [c.r, c.g, c.b]),
            frames: file.images.map((f, nativeFrame) => ({ nativeFrame, x: f.x, y: f.y, width: f.width, height: f.height,
                legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean),
                pixelHash: createHash('sha256').update(f.imageData).digest('hex'), pixels: Array.from(f.imageData) })) };
        writeFileSync(`${directory}/${file.filename}.json`, JSON.stringify(raw));
        return { ...raw, palette: undefined, frames: raw.frames.map(({ pixels, ...f }) => f) };
    });
    const effects: string[] = [];
    for (const field of ['Explosion', 'DebrisAnims'])
        effects.push(...rule.getString(field).split(',').filter(Boolean));
    effects.push(...(rules.getSection('AudioVisual')!.getString('DamageFireTypes') || 'FIRE01,FIRE02,FIRE03').split(','));
    const particles = rule.getString('DamageParticleSystems').split(',').filter(Boolean).map(name => {
        const system = rules.getSection(name), particle = rules.getSection(system?.getString('HoldsWhat') || '');
        if (particle?.getString('Image'))
            effects.push(particle.getString('Image'));
        return { name, system: plain(system), particle: plain(particle) };
    });
    for (const name of new Set(effects))
        if (!inventory.effects[name]) {
            const section = art.getSection(name), image = section?.getString('Image') || name;
            const f = new ImageFinder(loadImages([image]), { settings: { extension: '.tem', newTheaterChar: 'T' } }).tryFind(image, false);
            inventory.effects[name] = { name, retainedOriginal: true, art: plain(section), ...(f ? { ...identity(f.filename), canvas: [f.width, f.height], frames: f.numImages } : { status: 'NO_SHP_RESOLVED' }) };
        }
    inventory.families[id] = { rulesIdentity: id, imageName, art: plain(config), rules: plain(rule), hasShadow, members, animations,
        aggregateFrames: aggregate.file.numImages, bib: bib || null, foundation: config.getString('Foundation'), height: config.getNumber('Height'),
        dependencyGraph: { body: main.filename, bib: bibFile?.filename || null, animations: animations.map(a => ({ role: a.type, member: a.member })), sharedEffects: [...new Set(effects)], particles },
        theaters: [['TEMPERATE', 'T'], ['SNOW', 'A'], ['URBAN', 'U']].map(([theater, letter]) => {
            const f = new ImageFinder(images, { settings: { extension: theater === 'SNOW' ? '.sno' : theater === 'URBAN' ? '.urb' : '.tem', newTheaterChar: letter } });
            return { theater, policy: theater === 'TEMPERATE' ? 'representative-only-until-approved' : 'entirely-original', members: [...names].map(name => ({ artName: name, ...identity(f.find(name, useTheaterExtension).filename) })) };
        }),
        runtimeCoverage: 'NOT RUN', sourcePolicy: 'Declared native sequences; no inferred health stage or gameplay changes.' };
}
writeFileSync(`${out}/inventory.json`, JSON.stringify(inventory, null, 2) + '\n');
const ledger = { milestone: process.env.SOVIET_BATCH_MILESTONE ?? 'M1.6b', status: 'INVENTORIED', baseline: inventory.baseline, reviewGate: 'CONSOLIDATED_REPRESENTATIVE_PENDING',
    families: Object.fromEntries(families.map(id => [id, { status: 'inventoried', source: `source-v1/${id}`, masters: [], exports: [], decisions: [], failures: [], checks: { source: 'PASS', runtime: 'NOT RUN', art: 'NOT RUN' }, finalAccepted: false }])),
    scope: families, acceptedBaseline: 'M1_6A_ACCEPTED_AND_DELIVERED', runtimeActivation: false };
if (existsSync(`${root}/ledger.json`))
    throw Error('Do not overwrite existing ledger');
writeFileSync(`${root}/ledger.json`, JSON.stringify(ledger, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(families.map(id => [id, { members: inventory.families[id].members.map(m => ({ member: m.source.member, roles: m.roles, frames: m.frames.length, aggregate: m.aggregateVisibleFrames, offset: m.aggregateOffset })), animations: inventory.families[id].animations }])), null, 2));
