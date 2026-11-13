import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';

const output = path.resolve('.artifacts/m3-1/interface-hd/source');
fs.mkdirSync(output, { recursive: true });
const tree = retailTree(new Map(['language.mix', 'ra2.mix'].map(name => [name, fs.readFileSync('.local/assets/ra2/' + name)])));
const contract = JSON.parse(fs.readFileSync('.local/campaign/ra2/sov01t/presentation.json', 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const decoded: Record<string, PNG[]> = {}, sources = [];
for (const [identity, spec] of Object.entries(contract.sprites) as [string, any][]) {
    const member = resolveMember(tree, spec.image), palette = new Palette(resolveMember(tree, spec.palette).file);
    const shp = new ShpFile(member.file);
    const frames = shp.images.map((frame, index) => {
        const image = new PNG({ width: shp.width, height: shp.height });
        for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
            const color = palette.getColor(frame.imageData[y * frame.width + x]);
            image.data.set([color.r, color.g, color.b, 255], ((y + frame.y) * shp.width + x + frame.x) * 4);
        }
        const bytes = PNG.sync.write(image), filename = `${identity}-${index}.png`;
        fs.writeFileSync(path.join(output, filename), bytes);
        return { filename, bytes: bytes.length, sha256: sha(bytes), trim: [frame.x, frame.y, frame.width, frame.height] };
    });
    decoded[identity] = frames.map(frame => PNG.sync.read(fs.readFileSync(path.join(output, frame.filename))));
    sources.push({ identity, member: spec.image, sha256: sha(member.file.getBytes()), size: [shp.width, shp.height], frames });
}
for (const faction of ['allied', 'tutorial', 'soviet']) {
    const { x: ax, y: ay } = contract.anchors[faction], background = decoded.background[0];
    const bounds = [];
    for (const [i, image] of decoded[faction].entries()) {
        const mask = new PNG({ width: image.width, height: image.height });
        let left = image.width, top = image.height, right = 0, bottom = 0;
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
            const at = (y * image.width + x) * 4, bg = ((y + ay) * background.width + x + ax) * 4;
            const different = [0, 1, 2].some(channel => image.data[at + channel] !== background.data[bg + channel]);
            if (different && image.data[at + 3]) {
                mask.data.set(image.data.subarray(at, at + 4), at);
                left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
            }
        }
        fs.writeFileSync(path.join(output, `${faction}-foreground-${i}.png`), PNG.sync.write(mask));
        bounds.push([left, top, right-left, bottom-top]);
    }
    console.log(faction, bounds);
    const image = new PNG({ width: decoded[faction][0].width, height: decoded[faction][0].height * 4 });
    for (const [slot, frame] of [0, 1, 4, 7].entries()) {
        const input = PNG.sync.read(fs.readFileSync(path.join(output, `${faction}-foreground-${frame}.png`)));
        input.data.copy(image.data, slot * input.data.length);
    }
    fs.writeFileSync(path.join(output, `${faction}-reference.png`), PNG.sync.write(image));
}
fs.writeFileSync(path.join(output, 'source.json'), JSON.stringify({ sources, anchors: contract.anchors, animation: contract.animation }, null, 2) + '\n');
