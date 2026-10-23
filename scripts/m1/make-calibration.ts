import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const raw = JSON.parse(readFileSync('.artifacts/m1-1/conscript-source.json', 'utf8'));
const root = '.local/hd-packs/conscript-calibration/1';
mkdirSync(root, { recursive: true });
function crc(bytes: Uint8Array) {
    let c = 0xffffffff;
    for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
    return (c ^ 0xffffffff) >>> 0;
}
function png(width: number, height: number, rgba: Uint8Array) {
    const chunk = (name: string, data: Uint8Array) => {
        const body = Buffer.concat([Buffer.from(name), data]), result = Buffer.alloc(body.length + 8);
        result.writeUInt32BE(data.length); body.copy(result, 4); result.writeUInt32BE(crc(body), result.length - 4);
        return result;
    };
    const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
    const scan = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) scan.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
        chunk('IDAT', deflateSync(scan)), chunk('IEND', new Uint8Array())]);
}
const logicalFrames = raw.frames.slice(0, raw.frames.length / 2).map(f => ({ nativeFrame: f.nativeFrame,
    trimOrigin: [f.x, f.y], trimSize: [f.width, f.height], legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2],
    empty: !f.pixels.some(Boolean) }));
const variants = [];
for (const density of [2]) {
    const pageWidth = 2048;
    const frames = [];
    let x = 2, y = 2, rowHeight = 0;
    for (const f of logicalFrames) {
        const [w, h] = f.legacyRenderSize.map(n => n * density);
        if (x + w + 2 > pageWidth) { x = 2; y += rowHeight + 4; rowHeight = 0; }
        frames.push({ nativeFrame: f.nativeFrame, page: 'p0', sampleRect: [x, y, w, h],
            contentRect: [x, y, f.trimSize[0] * density, f.trimSize[1] * density] });
        x += w + 4; rowHeight = Math.max(rowHeight, h);
    }
    const pageHeight = Math.ceil((y + rowHeight + 2) / 16) * 16;
    if (pageHeight > 2048) throw new Error('Page budget exceeded');
    const base = new Uint8Array(pageWidth * pageHeight * 4), data = new Uint8Array(base.length);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    for (const f of frames) {
        const original = raw.frames[f.nativeFrame], [x, y, w, h] = f.contentRect;
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
            const index = original.pixels[Math.floor(py / density) * original.width + Math.floor(px / density)];
            const offset = ((y + py) * pageWidth + x + px) * 4;
            base.set([...raw.palette[index], index ? 255 : 0], offset);
            if (index >= 16 && index <= 31) data.set([255, index - 16, 0, 255], offset);
        }
    }
    const files = { base: png(pageWidth, pageHeight, base), data: png(pageWidth, pageHeight, data) };
    const page: any = { id: 'p0', size: [pageWidth, pageHeight] };
    for (const role of ['base', 'data']) {
        page[role] = `${density}x-${role}.png`; page[`${role}Sha256`] = hash(files[role]); page[`${role}Bytes`] = files[role].length;
        writeFileSync(`${root}/${page[role]}`, files[role]);
    }
    variants.push({ density, pages: [page], frames });
}
const manifest = { schemaVersion: 2, packId: 'conscript-calibration', packRevision: '1',
    purpose: 'Nearest-replicated calibration only; not authored HD artwork', source: raw.source,
    logical: { canvas: raw.canvas, frames: logicalFrames },
    color: { representation: 'authored-sRGB-RGBA8-plus-RGBA8-data' }, variants };
writeFileSync(`${root}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ root, variants: variants.map(v => ({ density: v.density, size: v.pages[0].size, frames: v.frames.length })) }));
