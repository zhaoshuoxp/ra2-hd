import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, '.artifacts/m3-1/feedback-native-r4');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rect = [850, 710, 600, 460], crops = [];
for (const density of [1, 4]) {
    const sourceName = `memorial-${density}x.png`, bytes = await fs.readFile(path.join(directory, sourceName));
    const source = PNG.sync.read(bytes), [x, y, width, height] = rect;
    assert(x + width <= source.width && y + height <= source.height);
    const crop = new PNG({ width, height });
    for (let row = 0; row < height; row++) {
        const start = ((y + row) * source.width + x) * 4;
        source.data.copy(crop.data, row * width * 4, start, start + width * 4);
    }
    const output = PNG.sync.write(crop), decoded = PNG.sync.read(output);
    assert.deepEqual(decoded.data, crop.data);
    const name = `memorial-detail-${density}x.png`;
    await fs.writeFile(path.join(directory, name), output);
    crops.push({ path: path.relative(root, path.join(directory, name)), bytes: output.length, sha256: sha(output), rect,
        source: { path: path.relative(root, path.join(directory, sourceName)), bytes: bytes.length, sha256: sha(bytes), size: [source.width, source.height] },
        sourcePixelsIdentical: true, scope: 'Exact native screenshot crop; no resampling, repaint or compositing.' });
}
await fs.writeFile(path.join(directory, 'crops.json'), JSON.stringify({ status: 'PASS_NATIVE_PIXEL_IDENTICAL_CROPS', crops }, null, 2) + '\n');
console.log(JSON.stringify(crops.map(crop => ({ path: crop.path, bytes: crop.bytes }))));
