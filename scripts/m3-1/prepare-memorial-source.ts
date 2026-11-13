import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zlibSync } from 'fflate';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
const out = path.resolve(process.argv[2] ?? '.artifacts/m3-1/memorial/source');
fs.mkdirSync(out, { recursive: true });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const tree = retailTree(new Map(['language.mix', 'ra2.mix'].map(name => [name, fs.readFileSync('.local/assets/ra2/' + name)])));
const crc = Array.from({ length: 256 }, (_, value) => { for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
function chunk(type: string, bytes: Uint8Array) {
    const data = Buffer.concat([Buffer.from(type), bytes]), result = Buffer.alloc(data.length + 8);
    result.writeUInt32BE(bytes.length); data.copy(result, 4);
    let check = 0xffffffff; for (const byte of data) check = crc[(check ^ byte) & 255] ^ (check >>> 8);
    result.writeUInt32BE((check ^ 0xffffffff) >>> 0, result.length - 4); return result;
}
function png(width: number, height: number, rgba: Uint8Array) {
    const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
    const rows = new Uint8Array(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlibSync(rows)), chunk('IEND', new Uint8Array())]);
}
const paletteFile = resolveMember(tree, 'uniturb.pal'), palette = new Palette(paletteFile.file);
const rubbleFile = resolveMember(tree, 'isourb.pal'), rubblePalette = new Palette(rubbleFile.file);
const sources = [];
for (const name of ['cuwash19.shp', 'cuwa19_a.shp']) {
    const source = resolveMember(tree, name), file = new ShpFile(source.file), bodyFrames = file.numImages / 2;
    const frames = file.images.map((frame, nativeFrame) => {
        const prefix = name.replace('.shp', '') + '-' + nativeFrame;
        const index = prefix + '.index'; fs.writeFileSync(path.join(out, index), frame.imageData);
        const colors = name === 'cuwash19.shp' && nativeFrame === 3 ? rubblePalette : palette;
        const rgba = new Uint8Array(frame.width * frame.height * 4);
        frame.imageData.forEach((index, pixel) => { const c = colors.getColor(index); rgba.set([c.r, c.g, c.b, index ? 255 : 0], pixel * 4); });
        fs.writeFileSync(path.join(out, prefix + '.png'), png(frame.width, frame.height, rgba));
        return { nativeFrame, trimOrigin: [frame.x, frame.y], trimSize: [frame.width, frame.height],
            legacyRenderSize: [frame.width + frame.width % 2, frame.height + frame.height % 2], empty: !frame.imageData.some(Boolean),
            index, indexSha256: sha(frame.imageData), png: prefix + '.png' };
    });
    sources.push({ member: name, archive: source.source, sha256: sha(source.file.getBytes()), canvas: [file.width, file.height],
        totalFrames: file.numImages, bodyFrames, frames,
        palette: { member: 'uniturb.pal', sha256: sha(paletteFile.file.getBytes()) }, hasShadow: true, remapable: false,
        ...(name === 'cuwash19.shp' ? { framePalettes: { 3: { member: 'isourb.pal', sha256: sha(rubbleFile.file.getBytes()), role: 'rubble', remapable: false, runtimeUsed: true } } } : {}) });
}
fs.writeFileSync(path.join(out, 'uniturb.pal'), paletteFile.file.getBytes());
fs.writeFileSync(path.join(out, 'isourb.pal'), rubbleFile.file.getBytes());
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ schemaVersion: 1, theater: 'URBAN', sources }, null, 2) + '\n');
console.log(sources.map(source => ({ member: source.member, sha256: source.sha256, frames: source.bodyFrames,
    bodyHashes: source.frames.slice(0, Math.min(source.bodyFrames, 4)).map(frame => frame.indexSha256) })));
