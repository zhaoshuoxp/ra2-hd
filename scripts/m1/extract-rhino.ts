// Resolve the same image stem and independent parts as Vehicle.createMainObject.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { VxlFile } from '../../src/data/VxlFile';
import { HvaFile } from '../../src/data/HvaFile';
import { Palette } from '../../src/data/Palette';
import { VplFile } from '../../src/data/VplFile';
import { VxlGeometryMonotoneBuilder } from '../../src/engine/renderable/builder/vxlGeometry/VxlGeometryMonotoneBuilder';

const output = process.argv[2] ?? '.artifacts/m1-3/source-v1';
if (existsSync(output)) throw Error('Use a fresh source directory');
mkdirSync(output, { recursive: true });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
    [name, readFileSync(`.local/assets/ra2/${name}`)])));
const resolve = (name: string) => {
    const entry = resolveMember(tree, name);
    return { file: entry.file, identity: { member: name, archive: entry.source, sha256: hash(entry.file.getBytes()) } };
};
const rules = new IniFile(resolve('rules.ini').file.readAsString()).getSection('HTNK')!;
const image = rules.get('Image') || 'HTNK';
const art = new IniFile(resolve('art.ini').file.readAsString()).getSection(image)!;
const stem = (art.get('Image') || image).toLowerCase();
const parts = ['', 'tur', 'barl'].map(suffix => {
    const v = resolve(`${stem}${suffix}.vxl`), h = resolve(`${stem}${suffix}.hva`);
    const vxl = new VxlFile(v.file), hva = new HvaFile(h.file);
    const sections = vxl.sections.map((section, index) => {
        const started = performance.now(), geometry = new VxlGeometryMonotoneBuilder().build(section);
        const buildMs = performance.now() - started;
        const { voxelField, voxels } = section.getAllVoxels();
        const exposedFaces = voxels.reduce((sum, v) => sum + [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
            .filter(([x,y,z]) => !voxelField.get(v.x+x,v.y+y,v.z+z)).length, 0);
        return { ...section.toPlain(), occupancy: voxels.length, exposedFaces,
            hvaName: hva.sections[index].name, hvaMatrices: hva.sections[index].matrices.map(m => m.toArray()),
            appliedHva: section.scaleHvaMatrix(hva.sections[index].getMatrix(0)).toArray(),
            geometry: { buildMs, vertices: geometry.attributes.position.count, triangles: geometry.index!.count / 3,
                bytes: Object.values(geometry.attributes).reduce((n, a) => n + a.array.byteLength, geometry.index!.array.byteLength),
                bounds: geometry.boundingBox }, normals: section.getNormals().map(n => n.toArray()) };
    });
    writeFileSync(`${output}/${stem}${suffix}.json`, JSON.stringify({ source: v.identity, hva: h.identity, sections }));
    return { source: v.identity, hva: h.identity, sections: sections.map(({ spans, normals, ...s }) => s) };
});
const palette = resolve('unittem.pal'), vpl = resolve('voxels.vpl');
const lookup = new VplFile(vpl.file);
writeFileSync(`${output}/palette.json`, JSON.stringify(new Palette(palette.file).colors.map(c => [c.r,c.g,c.b])));
writeFileSync(`${output}/inventory.json`, JSON.stringify({ unit: 'HTNK', stem, rules: Object.fromEntries(rules.entries),
    art: Object.fromEntries(art.entries), parts, palette: palette.identity,
    vpl: { ...vpl.identity, remap: [lookup.remapStart, lookup.remapEnd], rows: 32 } }, null, 2) + '\n');
console.log(JSON.stringify({ output, stem, parts }, null, 2));
