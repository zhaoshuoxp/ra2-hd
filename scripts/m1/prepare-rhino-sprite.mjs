import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { identity } from './rhino-sprite/contract.ts';
const root = '.artifacts/m1-3c';
const receipt = JSON.parse(await fs.readFile('.artifacts/m1-3-zoom/display-target-acceptance.json'));
if (receipt.selectedImageSha256 !== identity.target || receipt.underlyingArtSha256 !== identity.source)
    throw Error('Unexpected accepted target/source receipt');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [file, expected] of [[receipt.selectedImage, receipt.selectedImageSha256],
    [receipt.underlyingArtSource, receipt.underlyingArtSha256],
    [receipt.tankLayerExport, identity.export]]) {
    if (hash(await fs.readFile(file)) !== expected) throw Error(`Source identity mismatch: ${file}`);
}
await fs.mkdir(`${root}/candidate`, { recursive: true });
await fs.copyFile(receipt.tankLayerExport, `${root}/candidate/primary-4x.png`);
await fs.writeFile(`${root}/candidate/provenance.json`, JSON.stringify({ ...receipt,
    diagnostic: 'M1.3c single-pose only; unchanged transparent export; no new art or remap',
    exportMetadata: JSON.parse(await fs.readFile('.artifacts/m1-3a/review-v2/export.json')).poses[0],
}, null, 2) + '\n');
execFileSync('bun', ['build', 'scripts/m1/rhino-sprite/adapter.ts', '--target', 'browser', '--format', 'iife', '--outfile', `${root}/adapter.js`], { stdio: 'inherit' });
const files = {};
async function walk(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.isDirectory()) await walk(`${dir}/${entry.name}`, `${name}/`);
        else files[name] = hash(await fs.readFile(`${dir}/${entry.name}`));
    }
}
await walk(`${root}/build`);
await fs.writeFile(`${root}/build-identity.json`, JSON.stringify({ checkout: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    files, adapter: hash(await fs.readFile(`${root}/adapter.js`)), candidate: hash(await fs.readFile(`${root}/candidate/primary-4x.png`)),
    contract: 'Fresh M1.4 production C / reference height 900; art served separately; explicit injected diagnostic only',
}, null, 2) + '\n');
console.log('Verified accepted target/source/export; prepared isolated single-pose proof.');
