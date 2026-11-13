import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.resolve(root, process.argv[2]);
assert(directory.startsWith(root + path.sep));
const report = JSON.parse(await fs.readFile(path.join(directory, 'report.json'), 'utf8'));
assert.equal(report.status, 'PASS_HD_INTERFACE_AND_ORIGINAL_BRIDGE_INITIALIZATION_REPAIR');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rect = [450, 400, 1540, 730], crops = [];
for (const density of [4, 1]) for (const phase of ['before', 'after']) {
    const sourceName = `bridge-${density}x-${phase}-engineer.png`;
    const bytes = await fs.readFile(path.join(directory, sourceName)), source = PNG.sync.read(bytes);
    const [x, y, width, height] = rect;
    assert(x + width <= source.width && y + height <= source.height);
    const crop = new PNG({ width, height });
    for (let row = 0; row < height; row++) {
        const start = ((y + row) * source.width + x) * 4;
        source.data.copy(crop.data, row * width * 4, start, start + width * 4);
    }
    const output = PNG.sync.write(crop), name = `bridge-detail-${density}x-${phase}.png`;
    assert.deepEqual(PNG.sync.read(output).data, crop.data);
    await fs.writeFile(path.join(directory, name), output);
    crops.push({ path: path.relative(root, path.join(directory, name)), bytes: output.length, sha256: sha(output), rect,
        source: { path: path.relative(root, path.join(directory, sourceName)), bytes: bytes.length,
            sha256: sha(bytes), size: [source.width, source.height] },
        sourcePixelsIdentical: true, scope: 'Exact native screenshot crop; no resampling, repaint or compositing.' });
}
await fs.writeFile(path.join(directory, 'crops.json'), JSON.stringify({ status: 'PASS_NATIVE_PIXEL_IDENTICAL_CROPS', crops }, null, 2) + '\n');
console.log(JSON.stringify(crops.map(crop => ({ path: crop.path, bytes: crop.bytes }))));
