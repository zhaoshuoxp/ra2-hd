import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { VxlFile } from '../../src/data/VxlFile';
import { HvaFile } from '../../src/data/HvaFile';
import { VxlGeometryMonotoneBuilder } from '../../src/engine/renderable/builder/vxlGeometry/VxlGeometryMonotoneBuilder';

// Independent offset-based decoding checks the current sequential reader against local files.
// Format reference: OpenRA.Mods.Cnc/FileFormats/VxlReader.cs (format only, no engine replacement).
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix']
    .map(name => [name, readFileSync(`.local/assets/ra2/${name}`)])));
const report = [];
for (const name of ['mcv', 'smcv', 'htnk', 'mtnk', 'orca', 'falc', 'pdplane']) {
    const member = resolveMember(tree, `${name}.vxl`), file = member.file;
    const bytes = file.getBytes(), data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const parsed = new VxlFile(file), hva = new HvaFile(resolveMember(tree, `${name}.hva`).file);
    const body = 802 + 28 * data.getUint32(20, true), tail = body + data.getUint32(28, true);
    const sections = parsed.sections.map((section, index) => {
        const t = tail + 92 * index, start = body + data.getUint32(t, true);
        const end = body + data.getUint32(t + 4, true), spanData = body + data.getUint32(t + 8, true);
        const voxels = [];
        for (let y = 0; y < section.sizeY; y++) for (let x = 0; x < section.sizeX; x++) {
            const column = x + y * section.sizeX;
            const first = data.getInt32(start + 4 * column, true), last = data.getInt32(end + 4 * column, true);
            if (first === -1 || last === -1) continue;
            let cursor = spanData + first, z = 0;
            while (z < section.sizeZ) {
                z += data.getUint8(cursor++);
                const count = data.getUint8(cursor++);
                for (let n = 0; n < count; n++) voxels.push({x, y, z: z++,
                    colorIndex: data.getUint8(cursor++), normalIndex: data.getUint8(cursor++)});
                assert.equal(data.getUint8(cursor++), count);
                assert.ok(cursor <= spanData + last + 1);
            }
        }
        assert.deepEqual(section.spans.flatMap(s => s.voxels), voxels);
        const geometry = new VxlGeometryMonotoneBuilder().build(section);
        const positions = geometry.attributes.position;
        assert.ok(Array.from(positions.array).every(Number.isFinite));
        const result = {name:section.name, dimensions:[section.sizeX,section.sizeY,section.sizeZ], voxels:voxels.length,
            bounds:[section.minBounds.toArray(),section.maxBounds.toArray()], vertices:positions.count,
            triangles:geometry.index!.count/3, offsetDecoderMatches:true, hvaSection:hva.sections[index]?.name,
            hvaFrames:hva.sections[index]?.matrices.length};
        geometry.dispose();
        return result;
    });
    report.push({name, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), sections});
}
writeFileSync('.artifacts/rendering/model-audit.json', JSON.stringify(report, null, 2)+'\n');
console.log(report.map(x => ({name:x.name, voxels:x.sections.reduce((n,s)=>n+s.voxels,0), verified:true})));
