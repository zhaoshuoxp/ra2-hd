import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
const root = path.resolve('.artifacts/m3-1/memorial'), source = path.join(root, 'source');
const body = new PNG({ width: 1536, height: 1024 });
const flags = new PNG({ width: 1536, height: 768 });
for (const image of [body, flags]) for (let offset = 0; offset < image.data.length; offset += 4) image.data.set([68, 72, 76, 255], offset);
const slots = [];
async function place(board, name, x, y, scale, id) {
    const image = PNG.sync.read(await fs.readFile(path.join(source, name)));
    for (let row = 0; row < image.height * scale; row++) for (let column = 0; column < image.width * scale; column++) {
        const at = (Math.floor(row / scale) * image.width + Math.floor(column / scale)) * 4;
        if (image.data[at + 3]) board.data.set(image.data.subarray(at, at + 4), ((row + y) * board.width + column + x) * 4);
    }
    slots.push({ id, source: name, rect: [x, y, image.width * scale, image.height * scale], nativeSize: [image.width, image.height], scale });
}
for (let i = 0; i < 4; i++) {
    const image = PNG.sync.read(await fs.readFile(path.join(source, `cuwash19-${i}.png`)));
    await place(body, `cuwash19-${i}.png`, i % 2 * 768 + Math.floor((768 - image.width * 4) / 2),
        Math.floor(i / 2) * 512 + Math.floor((512 - image.height * 4) / 2), 4, 'body-' + i);
}
for (let i = 0; i < 3; i++) {
    const name = `cuwa19_a-${i * 16}.png`, image = PNG.sync.read(await fs.readFile(path.join(source, name)));
    await place(flags, name, i * 512 + Math.floor((512 - image.width * 10) / 2), Math.floor((768 - image.height * 10) / 2), 10, 'flag-' + i);
}
await fs.writeFile(path.join(root, 'body-reference.png'), PNG.sync.write(body));
await fs.writeFile(path.join(root, 'flag-reference.png'), PNG.sync.write(flags));
await fs.writeFile(path.join(root, 'reference-slots.json'), JSON.stringify({ bodySize: [1536, 1024], flagSize: [1536, 768], slots }, null, 2) + '\n');
