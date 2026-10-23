// Bounded dependency follow-up to the shared native building inventory.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember, parseMix } from '../../../src/offline/retail';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';
import { IniFile } from '../../../src/data/IniFile';
import { ShpFile } from '../../../src/data/ShpFile';
import { VxlFile } from '../../../src/data/VxlFile';
import { HvaFile } from '../../../src/data/HvaFile';
import { ImageFinder } from '../../../src/engine/ImageFinder';

const root = process.argv[2] ?? '.artifacts/allied-buildings';
const output = `${root}/${process.argv[4] ?? 'dependencies-v1.json'}`;
if (existsSync(output)) throw Error('Preserve dependency evidence; select a new revision');
const inventory = JSON.parse(readFileSync(`${root}/${process.argv[3] ?? 'source-v2'}/inventory.json`, 'utf8'));
const top = new Map(GAME_EDITIONS.yr.archives.map(name => [name,
    readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)]));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const outputRows: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    tree.push({ path: 'upstream-support/ra2cd.mix', mix: parseMix(readFileSync('.local/upstream-support/ra2cd.mix'), 'ra2cd.mix') });
    const art = new IniFile(resolveMember(tree, GAME_EDITIONS[edition].art).file.readAsString());
    const rules = new IniFile(resolveMember(tree, GAME_EDITIONS[edition].rules).file.readAsString());
    const identity = (name: string) => {
        const found = resolveMember(tree, name);
        return { member: name, archive: found.source, sha256: sha(found.file.getBytes()) };
    };
    for (const row of inventory.matrix.filter(r => r.edition === edition)) {
        const settings = { TEMPERATE: ['T', '.tem'], URBAN: ['U', '.urb'], SNOW: ['A', '.sno'],
            NEWURBAN: ['N', '.ubn'], DESERT: ['D', '.des'], LUNAR: ['L', '.lun'] }[row.theater];
        const names = new Set<string>();
        for (const field of ['Explosion', 'DebrisAnims'])
            String(row.rules[field] || '').split(',').filter(Boolean).forEach(name => names.add(name));
        for (const [key, value] of Object.entries(row.art))
            if (/^DestroyAnim/.test(key)) String(value).split(',').filter(Boolean).forEach(name => names.add(name));
        rules.getSection('AudioVisual')!.getString('DamageFireTypes').split(',').filter(Boolean).forEach(name => names.add(name));
        const particles = String(row.rules.DamageParticleSystems || '').split(',').filter(Boolean).map(name => {
            const system = rules.getSection(name), particle = rules.getSection(system?.getString('HoldsWhat') || '');
            if (particle?.getString('Image')) names.add(particle.getString('Image'));
            return { name, system: system && Object.fromEntries(system.entries), particle: particle && Object.fromEntries(particle.entries) };
        });
        const sharedEffects = [...names].map(name => {
            const section = art.getSection(name), image = section?.getString('Image') || name;
            const files = new Map<string, ShpFile>();
            for (const candidate of [image, ...['T', 'U', 'A', 'G', 'N', 'D', 'L'].map(c => image[0] + c + image.slice(2))]) {
                const filename = candidate.toLowerCase() + '.shp';
                try { files.set(filename, new ShpFile(resolveMember(tree, filename).file)); } catch {}
            }
            const finder = new ImageFinder(files, { settings: { newTheaterChar: settings[0], extension: settings[1] } });
            const file = finder.tryFind(image, section?.getBool('Theater') || false);
            return { name, retainedOriginal: true, art: section && Object.fromEntries(section.entries),
                ...(file ? { ...identity(file.filename), canvas: [file.width, file.height], frames: file.numImages }
                    : { status: 'UNRESOLVED_SHARED_EFFECT' }) };
        });
        const voxelParts = row.dependencies.map(dep => {
            if (!dep.sha256) return dep;
            const file = resolveMember(tree, dep.member).file;
            const parsed = dep.member.endsWith('.vxl') ? new VxlFile(file) : new HvaFile(file);
            return { ...dep, sections: parsed.sections.map((s: any) => ({ name: s.name,
                size: s.sizeX === undefined ? undefined : [s.sizeX, s.sizeY, s.sizeZ], frames: s.matrices?.length,
                nativeOwnerVoxels: s.getAllVoxels ? s.getAllVoxels().voxels.filter((v: any) => v.colorIndex >= 16 && v.colorIndex <= 31).length : undefined })) };
        });
        outputRows.push({ edition, theater: row.theater, id: row.id, sharedEffects, particles, voxelParts,
            paletteSemantics: { remappable: row.art.Remapable?.toLowerCase() !== 'no', altPalette: row.palette.altPalette },
            missingDeclarations: inventory.missingMembers.filter(m => m.edition === edition && m.theater === row.theater && m.id === row.id) });
    }
}
writeFileSync(output, JSON.stringify({ schemaVersion: 1, status: 'SOURCE_DEPENDENCIES_ONLY', rows: outputRows }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ cells: outputRows.length, voxelIdentities: [...new Set(outputRows.filter(r => r.voxelParts.length).map(r => r.id))] }));
