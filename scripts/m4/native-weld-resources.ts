// Build every retail VXL section reachable from art catalog names with the
// native weld and with the original generic merger; compare all output bytes.
// Usage: bun scripts/m4/native-weld-resources.ts [resourceRoot] [report.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as THREE from 'three';
import { parseMix, retailTree, type Container } from '../../src/offline/retail';
import { MixFile } from '../../src/data/MixFile';
import { IniFile } from '../../src/data/IniFile';
import { VxlFile } from '../../src/data/VxlFile';
import { BufferGeometryUtils } from '../../src/engine/gfx/BufferGeometryUtils';
import { VxlGeometryMonotoneBuilder } from '../../src/engine/renderable/builder/vxlGeometry/VxlGeometryMonotoneBuilder';
import { mergeNativeVxlVertices } from '../../src/engine/renderable/builder/vxlGeometry/mergeNativeVxlVertices';

const root = path.resolve(process.argv[2] ?? '.local');
const reportFile = process.argv[3] && path.resolve(process.argv[3]);
const read = (relative: string) => new Uint8Array(readFileSync(path.join(root, relative)));
const ra2 = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name => [name, read(`assets/ra2/${name}`)])));
const yr: Container[] = [];
for (const name of ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']) {
    const visit = (label: string, mix: MixFile, depth: number) => {
        yr.push({ path: label, mix });
        for (const child of ['localmd.mix', 'cachemd.mix', 'conqmd.mix', 'audiomd.mix'])
            if (depth < 3 && mix.containsFile(child)) visit(`${label}/${child}`, new MixFile(mix.openFile(child).stream), depth + 1);
    };
    visit(name, parseMix(read(`assets/yr/${name}`), name), 0);
}
const trees = [...yr, ...ra2];
const find = (name: string) => trees.find(({ mix }) => mix.containsFile(name))?.mix.openFile(name);
const names = new Set<string>();
for (const art of ['art.ini', 'artmd.ini']) {
    const file = find(art);
    if (!file) continue;
    const ini = new IniFile(file.readAsString());
    for (const section of ini.getOrderedSections()) {
        const image = String(section.getString('Image') || section.name).toLowerCase();
        for (const base of new Set([section.name.toLowerCase(), image]))
            for (const suffix of ['', 'tur', 'barl', 'wo', 'tur2', 'barl2']) names.add(base + suffix + '.vxl');
    }
}
const native = new VxlGeometryMonotoneBuilder();
const generic = new VxlGeometryMonotoneBuilder(geometry => BufferGeometryUtils.mergeVertices(geometry));
const bytes = (geometry: THREE.BufferGeometry) => {
    const h = createHash('sha256');
    for (const name of Object.keys(geometry.attributes)) {
        const a = geometry.getAttribute(name) as THREE.BufferAttribute;
        h.update(name + a.itemSize + a.array.constructor.name);
        h.update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
    }
    const index = geometry.index!.array;
    h.update(index.constructor.name).update(Buffer.from(index.buffer, index.byteOffset, index.byteLength));
    h.update(JSON.stringify(geometry.boundingBox));
    return h.digest('hex');
};
const report: any = { schema: 'm4-native-weld-resources-v1', root, files: 0, sections: 0, builds: 0, vertices: 0, mismatches: [] };
const digest = createHash('sha256');
let nativeMs = 0, genericMs = 0;
for (const name of [...names].sort()) {
    const file = find(name);
    if (!file) continue;
    let vxl: VxlFile;
    try { vxl = new VxlFile(file); } catch { continue; }
    report.files++;
    for (const section of vxl.sections) {
        report.sections++;
        for (const colorOnly of [false, true]) {
            let at = performance.now();
            const a = native.build(section, colorOnly);
            nativeMs += performance.now() - at; at = performance.now();
            const b = generic.build(section, colorOnly);
            genericMs += performance.now() - at;
            const left = bytes(a), right = bytes(b);
            report.builds++; report.vertices += a.getAttribute('position').count; digest.update(left);
            if (left !== right) report.mismatches.push({ name, section: section.name, colorOnly });
            a.dispose(); b.dispose();
        }
    }
}
report.outputDigest = digest.digest('hex');
report.timing = { nativeMs, genericMs, note: 'Complete builder time including meshing; Bun host timing.' };
report.status = report.files > 0 && !report.mismatches.length ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 2));
if (reportFile) writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
if (report.status !== 'PASS') process.exitCode = 1;
