import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { GAME_EDITIONS } from '../../src/editions/GameEdition';
import { VxlFile } from '../../src/data/VxlFile';
import { VxlGeometryMonotoneBuilder } from '../../src/engine/renderable/builder/vxlGeometry/VxlGeometryMonotoneBuilder';
import { BufferGeometryUtils } from '../../src/engine/gfx/BufferGeometryUtils';
import { mergeNativeVxlVertices } from '../../src/engine/renderable/builder/vxlGeometry/mergeNativeVxlVertices';

const [resourceRoot, output] = process.argv.slice(2);
if (!resourceRoot || !output) throw Error('Use: bun native-weld-benchmark.ts /resource/root /new/report.json');
const top = new Map(GAME_EDITIONS.yr.archives.map(name => [name,
    readFileSync(`${resourceRoot}/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)]));
const tree = editionRetailTree(top, 'yr');
const members = ['disk.vxl', 'mtnk.vxl', 'mtnktur.vxl'];
const rows: any[] = [];
for (const member of members) {
    const file = resolveMember(tree, member).file;
    const native = new VxlFile(file), samples: any[] = [];
    for (let block = -4; block < 16; block++) {
        for (const mode of block % 2 ? ['candidate', 'reference'] : ['reference', 'candidate']) {
            const merger = mode === 'candidate' ? mergeNativeVxlVertices : BufferGeometryUtils.mergeVertices;
            let mergeMs = 0, meshes = 0;
            const builder = new VxlGeometryMonotoneBuilder(geometry => {
                const begun = performance.now(), result = merger(geometry);
                mergeMs += performance.now() - begun;
                return result;
            });
            const begun = performance.now();
            for (let repeat = 0; repeat < 3; repeat++) for (const section of native.sections) {
                const result = builder.build(section); meshes++; result.dispose();
            }
            if (block >= 0) samples.push({ block, mode, meshes, buildMs: performance.now() - begun, mergeMs });
        }
    }
    rows.push({ member, sections: native.sections.length, samples });
}
const report = { schema: 'm4-native-weld-diagnostic-v1', runtime: { name: 'Bun', version: Bun.version },
    scope: 'Interleaved warm CPU diagnostic on retail meshes; not native Electron FPS or a cold-cache claim.',
    warmupBlocks: 4, retainedBlocks: 16, iterationsPerBlock: 3, rows };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
for (const row of rows) {
    const totals = Object.fromEntries(['reference', 'candidate'].map(mode => {
        const selected = row.samples.filter((sample: any) => sample.mode === mode);
        return [mode, { buildMs: selected.reduce((sum: number, sample: any) => sum + sample.buildMs, 0),
            mergeMs: selected.reduce((sum: number, sample: any) => sum + sample.mergeMs, 0) }];
    }));
    console.log(JSON.stringify({ member: row.member, ...totals }));
}
