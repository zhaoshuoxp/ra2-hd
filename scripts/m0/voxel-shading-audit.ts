import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { VxlFile } from '../../src/data/VxlFile';

// Diagnostic only: no runtime loader or distributable retail payload.
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix']
    .map(name => [name, readFileSync(`.local/assets/ra2/${name}`)])));
const member = resolveMember(tree, 'voxels.vpl'), bytes = member.file.getBytes();
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const sections = view.getUint32(8, true), remapStart = view.getUint32(0, true), remapEnd = view.getUint32(4, true);
assert.equal(sections, 32);
assert.equal(bytes.length, 16 + 768 + sections * 256);
assert.deepEqual([remapStart, remapEnd], [16, 31]);
const tables = bytes.slice(16 + 768);
const model = new VxlFile(resolveMember(tree, 'mcv.vxl').file);
const indices = new Set(model.sections.flatMap(section => section.getAllVoxels().voxels.map(v => v.colorIndex)));
let changedLookups = 0;
for (const index of indices) for (let section = 0; section < sections; section++) {
    if (tables[section * 256 + index] !== index) changedLookups++;
}
const report = { source: member.source, member: 'voxels.vpl', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), sections, remapStart, remapEnd,
    mcvColorIndices: indices.size, mcvChangedLookups: changedLookups,
    note: 'Archive analysis only; runtime use is checked separately by the browser probe.' };
mkdirSync('.artifacts/mcv', { recursive: true });
writeFileSync('.artifacts/mcv/shading-audit.json', JSON.stringify(report, null, 2) + '\n');
writeFileSync('.artifacts/mcv/vpl-tables.json', JSON.stringify(Array.from(tables)) + '\n');
console.log(report);
