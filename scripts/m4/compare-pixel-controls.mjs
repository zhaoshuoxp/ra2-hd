// Compare static pixel-control reports (raw RGBA SHA256 per fixed camera) between two runs.
// Usage: node compare-pixel-controls.mjs <baselineDir> <candidateDir> [<baselineDir> <candidateDir> ...] [--out=file]
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), out = args.find(a => a.startsWith('--out='))?.slice(6);
const dirs = args.filter(a => !a.startsWith('--'));
const rows = [];
for (let i = 0; i < dirs.length; i += 2) {
    const [a, b] = [dirs[i], dirs[i + 1]].map(dir => JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')));
    for (const image of a.pixelControls.images) {
        const other = b.pixelControls.images.find(row => row.label === image.label);
        rows.push({ density: a.density, label: image.label, tick: image.tick, bytes: image.bytes,
            baselineHead: a.runtimeIdentity.packageSourceHead, candidateHead: b.runtimeIdentity.packageSourceHead,
            baselineSha256: image.sha256, candidateSha256: other?.sha256, identical: image.sha256 === other?.sha256,
            repeatedIdentical: image.differentBytes === 0 && other?.differentBytes === 0,
            hdVehicles: [image.hdVehicles, other?.hdVehicles], cameraMatch: JSON.stringify(image.camera) === JSON.stringify(other?.camera),
            baseline: path.basename(dirs[i]), candidate: path.basename(dirs[i + 1]) });
    }
}
const result = { schema: 'm4-2-pixel-parity-v1', status: rows.length && rows.every(r => r.identical && r.repeatedIdentical && r.cameraMatch)
    ? 'PASS_EXACT_RGBA' : 'DIFFERENT', rows };
console.log(JSON.stringify(result, null, 2));
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
