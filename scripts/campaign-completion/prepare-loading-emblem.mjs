import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { vectorPaths } from '../art/palette-contours.mjs';

const [recipeArg, outputArg] = process.argv.slice(2);
const recipeFile = path.resolve(recipeArg), recipe = JSON.parse(await fs.readFile(recipeFile));
const resolve = name => path.resolve(path.dirname(recipeFile), name);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const masterBytes = await fs.readFile(resolve(recipe.master)), originalBytes = await fs.readFile(resolve(recipe.original));
assert.equal(sha(masterBytes), recipe.masterSha256); assert.equal(sha(originalBytes), recipe.originalPngSha256);
const master = PNG.sync.read(masterBytes), original = PNG.sync.read(originalBytes);
assert.equal(recipe.alphaCutoff, 192); assert.equal(recipe.neutralThreshold, 40);
const mask = new PNG({ width: master.width, height: master.height });
const bounds = { left: master.width, top: master.height, right: 0, bottom: 0 };
let retained = 0, nonzero = 0;
for (let y = 0; y < master.height; y++) for (let x = 0; x < master.width; x++) {
    const i = (y * master.width + x) * 4;
    if (master.data[i + 3]) nonzero++;
    if (master.data[i + 3] < recipe.alphaCutoff) continue;
    mask.data.set([255, 255, 255, 255], i); retained++;
    bounds.left = Math.min(bounds.left, x); bounds.top = Math.min(bounds.top, y);
    bounds.right = Math.max(bounds.right, x + 1); bounds.bottom = Math.max(bounds.bottom, y + 1);
}
assert(retained > 10000 && retained < master.width * master.height);
const [rx, ry, rw, rh] = recipe.nativeRegion;
assert([rx, ry, rw, rh].every(Number.isSafeInteger) && rx >= 0 && ry >= 0 && rw > 0 && rh > 0
    && rx + rw <= original.width && ry + rh <= original.height);
const native = { left: rw, top: rh, right: 0, bottom: 0 }, metal = Buffer.alloc(rw * rh);
for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const i = ((ry + y) * original.width + rx + x) * 4;
    const [r, g, b] = original.data.subarray(i, i + 3);
    const olive = recipe.nativeMask === 'olive-training-hat' && g >= r * .8 && g > b * 1.1
        && Math.max(r, g, b) > 20 && Math.max(r, g, b) < 110;
    if (!olive && Math.min(r, g, b) < recipe.neutralThreshold) continue;
    metal[y * rw + x] = 1;
    native.left = Math.min(native.left, x); native.top = Math.min(native.top, y);
    native.right = Math.max(native.right, x + 1); native.bottom = Math.max(native.bottom, y + 1);
}
if (recipe.nativeMask === 'olive-training-hat') {
    const visited = new Uint8Array(metal.length); let largest = [];
    for (let start = 0; start < metal.length; start++) {
        if (!metal[start] || visited[start]) continue;
        const component = [], queue = [start]; visited[start] = 1;
        for (let p = 0; p < queue.length; p++) {
            const i = queue[p], x = i % rw, y = Math.floor(i / rw); component.push(i);
            for (const n of [x > 0 ? i - 1 : -1, x + 1 < rw ? i + 1 : -1,
                y > 0 ? i - rw : -1, y + 1 < rh ? i + rw : -1]) {
                if (n >= 0 && metal[n] && !visited[n]) { visited[n] = 1; queue.push(n); }
            }
        }
        if (component.length > largest.length) largest = component;
    }
    assert(largest.length > 10000); metal.fill(0);
    Object.assign(native, { left: rw, top: rh, right: 0, bottom: 0 });
    for (const i of largest) {
        metal[i] = 1; const x = i % rw, y = Math.floor(i / rw);
        native.left = Math.min(native.left, x); native.top = Math.min(native.top, y);
        native.right = Math.max(native.right, x + 1); native.bottom = Math.max(native.bottom, y + 1);
    }
}
assert(native.right > native.left && native.bottom > native.top);
const paths = vectorPaths(mask, undefined, { tolerance: .7, cornerRadius: .35, minimumArea: 4 });
assert.equal(paths.length, 1);
const registration = { schema: 'source-pinned-loading-emblem-clip-v1', masterSha256: sha(masterBytes),
    originalPngSha256: sha(originalBytes), alphaCutoff: recipe.alphaCutoff, neutralThreshold: recipe.neutralThreshold,
    nativeRegion: recipe.nativeRegion, nativeMetalMaskSha256: sha(metal), masterCoverageMaskSha256: sha(mask.data),
    masterFrame: [bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top],
    nativeBounds: [rx + native.left, ry + native.top, native.right - native.left, native.bottom - native.top],
    clipPath: paths[0].d, retainedMasterPixels: retained, excludedLowAlphaExteriorPixels: nonzero - retained,
    policy: 'Original master bytes and RGB remain unchanged. A continuous SVG clip removes exterior low-alpha generator halo; the target frame follows the original source metal bounds. No repaint, sharpen, blur or invented detail.' };
await fs.writeFile(path.resolve(outputArg), JSON.stringify(registration, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ masterFrame: registration.masterFrame, nativeBounds: registration.nativeBounds,
    retained, excludedExterior: nonzero - retained, pathBytes: paths[0].d.length }));
