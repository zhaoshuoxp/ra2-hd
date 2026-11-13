import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const oldRoot = path.resolve(process.argv[2]), newRoot = path.resolve(process.argv[3]), output = path.resolve(process.argv[4]);
const read = async file => JSON.parse(await fs.readFile(file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = await read(path.join(oldRoot, 'memorial-flag-hd.json'));
const revised = await read(path.join(newRoot, 'memorial-flag-hd-r8.json'));
assert.deepEqual(revised.source, original.source); assert.deepEqual(revised.logical, original.logical);
assert.deepEqual(revised.color, original.color);
const report = { status: 'RUNNING', preservedStates: [0, 31], revisedStates: [32, 47], densities: [], changedFiles: [], addedFiles: [] };
for (let v = 0; v < original.variants.length; v++) {
    const before = original.variants[v], after = revised.variants[v];
    assert.equal(after.density, before.density); assert.deepEqual(after.frames, before.frames);
    const a = before.pages[0], b = after.pages[0];
    assert.deepEqual(b.size, a.size);
    for (const key of ['data', 'dataBytes', 'dataSha256']) assert.equal(b[key], a[key]);
    const oldBytes = await fs.readFile(path.join(oldRoot, a.base)), newBytes = await fs.readFile(path.join(newRoot, b.base));
    assert.equal(sha(oldBytes), a.baseSha256); assert.equal(sha(newBytes), b.baseSha256);
    const oldPng = PNG.sync.read(oldBytes), newPng = PNG.sync.read(newBytes);
    assert.equal(newPng.width, oldPng.width); assert.equal(newPng.height, oldPng.height);
    for (let i = 3; i < oldPng.data.length; i += 4) assert.equal(newPng.data[i], oldPng.data[i], 'Native alpha changed');
    const frames = [];
    for (const frame of before.frames) {
        const [left, top, width, height] = frame.sampleRect;
        let changed = 0, gold = 0; const bounds = [width, height, 0, 0];
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const i = ((top + y) * oldPng.width + left + x) * 4;
            if (oldPng.data.subarray(i, i + 4).equals(newPng.data.subarray(i, i + 4))) continue;
            changed++; bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
            bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
            assert(x > 3 * before.density && x < width * .6 && y < height * .65, 'Change outside hoist insignia region');
            if (newPng.data[i] > 170 && newPng.data[i + 1] > 110 && newPng.data[i + 2] < 100) gold++;
        }
        if (frame.nativeFrame < 32) assert.equal(changed, 0, 'Unrequested flag state changed');
        else { assert(changed > 8); assert(gold > 4); }
        frames.push({ nativeFrame: frame.nativeFrame, changed, gold, ...(changed ? { bounds } : {}) });
    }
    report.densities.push({ density: before.density, alpha: 'EXACT', data: 'EXACT', geometry: 'EXACT', frames });
}
const beforeFiles = await fs.readdir(oldRoot), afterFiles = await fs.readdir(newRoot);
for (const name of beforeFiles) {
    const a = await fs.readFile(path.join(oldRoot, name)), b = await fs.readFile(path.join(newRoot, name));
    if (!a.equals(b)) report.changedFiles.push(name);
}
report.addedFiles = afterFiles.filter(name => !beforeFiles.includes(name)).sort();
assert.deepEqual(report.changedFiles.sort(), ['manifest.json', 'memorial-family.json']);
assert.deepEqual(report.addedFiles, ['memorial-flag-hd-r8.json', 'memorial-flag-r8-2-p0-base.png', 'memorial-flag-r8-4-p0-base.png']);
report.status = 'PASS_48_FLAG_SLOTS_BOTH_DENSITIES_EXACT_ALPHA_REGISTRATION_AND_PRESERVED_RESOURCES';
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, changedFiles: report.changedFiles, addedFiles: report.addedFiles }));
